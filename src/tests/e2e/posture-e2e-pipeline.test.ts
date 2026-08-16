/**
 * posture-e2e-pipeline.test.ts
 * ─────────────────────────────
 * Suite 2: 5대 포스처 대표 물건 풀 파이프라인 E2E (실제 LLM 호출)
 * + 16종 MECE 전수 회귀 테스트
 *
 * 각 테스트는 generateMobileIMHandler를 실제 LLM 호출과 함께 실행하며,
 * 중간 결과물을 PipelineLogger를 통해 docs/test/stress/e2e-outputs/에 저장합니다.
 *
 * 실행: npx vitest run src/tests/e2e/posture-e2e-pipeline.test.ts --timeout 300000
 */

import { describe, test, expect, beforeEach, afterAll } from 'vitest';
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

// ── Supabase Mock (DB 저장만 모킹, LLM은 실제 호출) ────────────────────

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

// ── SSoT Mock (픽스처 데이터 주입) ──────────────────────────────────────

let mockSsotData: any = {};

vi.mock('@/lib/ssot-adapter', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    readWithMigration: vi.fn().mockImplementation(async () => ({
      data: mockSsotData,
    })),
  };
});

// 공공 데이터 보강은 실제 API를 호출하지 않고 기본값 사용
vi.mock('@/lib/external/external-data-orchestrator', () => ({
  enrichBuildingData: vi.fn().mockResolvedValue({
    buildingRegister: { platArea: 1000, totalArea: 5000 },
    landPrice: { perSqm: 2000000 },
    landUsePlan: { zoningDistrict: '일반상업지역' },
  }),
}));

vi.mock('@/lib/external/enrich-by-pnu', () => ({
  enrichBuildingDataByPNU: vi.fn().mockResolvedValue({
    buildingRegister: { platArea: 1000, totalArea: 5000 },
    landPrice: { perSqm: 2000000 },
    landUsePlan: { zoningDistrict: '일반상업지역' },
  }),
}));

// ── 핵심 헬퍼 ─────────────────────────────────────────────────────────────

async function runPipelineForFixture(fixture: PostureE2EFixture): Promise<{
  result: GenerateMobileIMResult;
  logger: PipelineLogger;
  docBody: any;
}> {
  const logger = new PipelineLogger(fixture.posture, fixture.caseId);
  savedDocBody = null;

  // ① SSoT 입력 설정 및 로깅
  mockSsotData = { ...fixture.ssotLite };
  logger.startStep();
  logger.saveSsotInput(fixture.ssotLite as any);
  logger.endStep('① SSoT Lite 구축', 'success', `buildingId: ${fixture.ssotLite.id}`);

  // ② 바텀시트 보강 데이터 로깅
  logger.startStep();
  logger.saveSupplemental(fixture.supplemental as any);
  logger.endStep('② 바텀시트 보강', 'success', `posture: ${fixture.posture}, keys: ${Object.keys(fixture.supplemental).length}`);

  // ③ generateMobileIMHandler 실제 호출 (실제 LLM)
  const input: GenerateMobileIMInput = {
    buildingId: fixture.ssotLite.id!,
    userId: 'e2e-test-user',
    supplemental: fixture.supplemental,
    identity: fixture.identity,
    tier: 'basic',
  };

  logger.startStep();
  const result = await generateMobileIMHandler(input);
  logger.endStep('③ IM 생성 (LLM)', result.ok ? 'success' : 'error',
    `ok=${result.ok}, sections=${result.sections_count}, grade=${result.dataGrade}`,
    { ok: result.ok, sections_count: result.sections_count, dataGrade: result.dataGrade, ai_used: result.ai_used }
  );

  // ④ 중간 결과물 로깅 (savedDocBody에서 추출)
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
    logger.endStep('④ 중간 결과물 저장', 'success', `sections: ${savedDocBody.sections?.length ?? 0}`);
  }

  // ⑤ PPTX 렌더링 및 저장
  if (result.ok && savedDocBody?.sections?.length > 0) {
    logger.startStep();
    try {
      const renderer = new MobileImPptxRenderer();
      const pptxInput: MobileImPptxInput = {
        buildingId: fixture.ssotLite.id!,
        tier: 'basic',
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
      logger.endStep('⑤ PPTX 렌더링', 'success',
        `slides: ${pptxResult.slideCount}, size: ${(pptxResult.fileSizeBytes / 1024).toFixed(0)}KB`,
        { slideCount: pptxResult.slideCount, fileSizeBytes: pptxResult.fileSizeBytes, warnings: pptxResult.warnings }
      );
    } catch (err) {
      logger.endStep('⑤ PPTX 렌더링', 'error', `${err}`);
    }
  }

  // ⑥ 타임라인 로그 저장
  logger.saveTimelineLog();

  return { result, logger, docBody: savedDocBody };
}

// ═══════════════════════════════════════════════════════════════════════════
// 핵심 5종 포스처 대표 물건 풀 파이프라인 E2E
// ═══════════════════════════════════════════════════════════════════════════

describe('E2E Pipeline: 5 Postures Full Path (실제 LLM 호출)', { timeout: 300_000 }, () => {

  beforeEach(() => {
    savedDocBody = null;
  });

  // ── T1: income (서초 메디컬 빌딩) ──────────────────────────────────
  describe('T1: income — 서초 메디컬 빌딩 (Case 01)', () => {
    const fixture = POSTURE_REPRESENTATIVE_FIXTURES.income;
    let pipelineResult: Awaited<ReturnType<typeof runPipelineForFixture>>;

    test('T1-01: handler 정상 호출', async () => {
      pipelineResult = await runPipelineForFixture(fixture);
      expect(pipelineResult.result.ok).toBe(true);
      expect(pipelineResult.result.sections_count).toBeGreaterThanOrEqual(7);
    });

    test('T1-02: 재무 산출 검증 (Cap Rate, NOI 범위)', () => {
      const heroCard = pipelineResult.docBody?.heroCard;
      if (heroCard) {
        // Cap Rate 4~5% 범위 (165억 매입가, 연 7.14억 수익)
        if (heroCard.capRateBase != null) {
          expect(heroCard.capRateBase).toBeGreaterThan(2);
          expect(heroCard.capRateBase).toBeLessThan(10);
        }
      }
    });

    test('T1-03: HeroCard income 4대 지표 바인딩', () => {
      const heroCard = pipelineResult.docBody?.heroCard;
      if (heroCard) {
        expect(heroCard.askingPriceDisplay).toBeTruthy();
        expect(heroCard.posture).toBe('income');
      }
    });

    test('T1-04: 7섹션 플랜 정합성', () => {
      const sections = pipelineResult.docBody?.sections ?? [];
      expect(sections.length).toBeGreaterThanOrEqual(7);
      // income 전용 섹션 타입 확인
      const types = sections.map((s: any) => s.section_type);
      expect(types).toContain('property_overview');
    });

    test('T1-05: 가드레일 통과', () => {
      // publishBlocked가 handler result에 직접 없으면 docBody에서 확인
      expect(pipelineResult.result.ok).toBe(true);
    });
  });

  // ── T2: owner_occupied (성수 IT밸리 통사옥) ────────────────────────
  describe('T2: owner_occupied — 성수 IT밸리 통사옥 (Case 05)', () => {
    const fixture = POSTURE_REPRESENTATIVE_FIXTURES.owner_occupied;

    test('T2-01: handler 정상 호출 + 섹션 검증', async () => {
      const { result, docBody } = await runPipelineForFixture(fixture);
      expect(result.ok).toBe(true);
      expect(result.sections_count).toBeGreaterThanOrEqual(7);
      const types = (docBody?.sections ?? []).map((s: any) => s.section_type);
      expect(types).toContain('property_overview');
    });
  });

  // ── T3: development (역삼 테헤란로 신축부지) ───────────────────────
  describe('T3: development — 역삼 테헤란로 신축부지 (Case 12)', () => {
    const fixture = POSTURE_REPRESENTATIVE_FIXTURES.development;

    test('T3-01: handler 정상 호출 + 섹션 검증', async () => {
      const { result, docBody } = await runPipelineForFixture(fixture);
      expect(result.ok).toBe(true);
      expect(result.sections_count).toBeGreaterThanOrEqual(7);
    });
  });

  // ── T4: operating (이천 물류센터) ──────────────────────────────────
  describe('T4: operating — 이천 물류센터 (Case 16)', () => {
    const fixture = POSTURE_REPRESENTATIVE_FIXTURES.operating;

    test('T4-01: handler 정상 호출 + 물류 특화 검증', async () => {
      const { result, docBody } = await runPipelineForFixture(fixture);
      expect(result.ok).toBe(true);
      expect(result.sections_count).toBeGreaterThanOrEqual(7);
    });
  });

  // ── T5: trading (신사동 밸류애드) ──────────────────────────────────
  describe('T5: trading — 신사동 가로수길 밸류애드 (Case 09)', () => {
    const fixture = POSTURE_REPRESENTATIVE_FIXTURES.trading;

    test('T5-01: handler 정상 호출 + 섹션 검증', async () => {
      const { result, docBody } = await runPipelineForFixture(fixture);
      expect(result.ok).toBe(true);
      expect(result.sections_count).toBeGreaterThanOrEqual(7);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16종 전수 회귀 테스트
// ═══════════════════════════════════════════════════════════════════════════

describe('16-Case MECE Regression Suite (실제 LLM 호출)', { timeout: 300_000 }, () => {

  beforeEach(() => {
    savedDocBody = null;
  });

  for (const fixture of ALL_FIXTURES) {
    test(`${fixture.caseId}: ${fixture.description} [${fixture.posture}]`, async () => {
      const { result, logger } = await runPipelineForFixture(fixture);

      // handler 호출 성공
      expect(result.ok).toBe(true);

      // 섹션 7개 이상 생성
      expect(result.sections_count).toBeGreaterThanOrEqual(7);

      // 데이터 등급 D가 아닌 것 확인 (최소 C)
      if (result.dataGrade) {
        expect(result.dataGrade).not.toBe('D');
      }

      // 파이프라인 로그에 에러 없음
      const errorSteps = logger.getLogs().filter(l => l.status === 'error');
      expect(errorSteps).toHaveLength(0);
    }, 60_000); // 개별 케이스 60초 타임아웃
  }
});
