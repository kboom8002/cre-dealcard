import { describe, it, expect } from 'vitest';
import {
  DEALCARD_PPGT_PERSONAS,
  validateDealCardPersonaInvariants,
  scoreDealCardPpgtRun,
  verifyDealCardAntiSycophancyControls,
  rankDealCardPpgtBacklog,
  formatSimulatedReaction,
  type DealCardPpgtProbeMetrics,
} from '@/lib/qa/dealcard-ppgt-personas';
import {
  scanUxWriting,
  auditDealCardContentSuitability,
  auditNewsletterContentSuitability,
  auditImContentSuitability,
} from '@/lib/qa/ux-writing-and-content-oracle';
import {
  buildUnifiedCreReport100,
  blendScore100WithR3,
  FLOOR_CAP_100,
} from '@/lib/qa/unified-cre-rubric';
import { scoreImPpgtRun } from '@/lib/qa/im-ppgt-personas';
import { scoreNewsletterPpgtRun } from '@/lib/qa/newsletter-ppgt-personas';

function cleanDealCardMetrics(
  personaId: DealCardPpgtProbeMetrics['personaId'],
  overrides: Partial<DealCardPpgtProbeMetrics> = {},
): DealCardPpgtProbeMetrics {
  return {
    personaId,
    surface: '/broker/w/dealcards',
    viewport: '1440x900',
    fontScale: 'normal',
    aboveFoldActionCount: 11,
    totalVisibleInteractiveCount: 24,
    horizontalOverflowPx: 0,
    sub44ButtonsCount: 0,
    sub15TextsCount: 0,
    clippedButtonsCount: 0,
    brokenImgCount: 0,
    consoleErrorCount: 0,
    pageErrorCount: 0,
    poisonTokenCount: 0,
    bannedTermCount: 0,
    blindLeakCount: 0,
    numericSpinCount: 0,
    threeTierSpecMissingCount: 0,
    uxWritingViolationsCount: 0,
    contentSuitabilityViolationsCount: 0,
    taskCompleted: true,
    blockingModalDetected: false,
    boundaryViolationCount: 0,
    provenanceBadgeVisible: true,
    artifactValid: true,
    stepCount: 3,
    honestSaveVisible: true,
    ...overrides,
  };
}

describe('DealCard PPGT-Loop Persona SSOT, Unified 100pt Rubric & UX Writing/Content Oracle', () => {
  it('enforces 6 DealCard personas & all PPGT-Loop invariants (TC21, TC23, TC34, INV-403, INV-P06/P07)', () => {
    expect(DEALCARD_PPGT_PERSONAS).toHaveLength(6);
    const check = validateDealCardPersonaInvariants(DEALCARD_PPGT_PERSONAS);
    expect(check.violations).toEqual([]);
    expect(check.valid).toBe(true);
    expect(formatSimulatedReaction('딜카드 반응')).toBe('[SIMULATED] 딜카드 반응');
  });

  it('passes all 3 DealCard anti-sycophancy negative controls (NC-DC-01..03 <= 2.9 & floorRisk=true)', () => {
    const nc = verifyDealCardAntiSycophancyControls();
    expect(nc.failures).toEqual([]);
    expect(nc.passed).toBe(true);
    expect(nc.controls).toHaveLength(3);
    for (const c of nc.controls) {
      expect(c.score).toBeLessThanOrEqual(2.9);
      expect(c.floorRisk).toBe(true);
    }
  });

  it('caps both run and subsystem score at <= 46.25/100 when a single blind leak occurs (non-compensatory)', () => {
    const cleanRun = scoreDealCardPpgtRun(cleanDealCardMetrics('DC-MG-01'));
    const blindLeakRun = scoreDealCardPpgtRun(
      cleanDealCardMetrics('DC-MG-02', {
        surface: '/dc/leak-test',
        blindLeakCount: 1,
      }),
    );
    expect(blindLeakRun.floorRisk).toBe(true);
    expect(blindLeakRun.weightedOverall).toBeLessThanOrEqual(2.85);

    const imClean = scoreImPpgtRun({
      personaId: 'IM-MG-01',
      surface: '/broker/w/im',
      viewport: '1440x900',
      fontScale: 'xlarge',
      aboveFoldActionCount: 10,
      totalVisibleInteractiveCount: 20,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 0,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: true,
      artifactValid: true,
      honestSaveVisible: true,
    });
    const nlClean = scoreNewsletterPpgtRun({
      personaId: 'NL-MG-01',
      surface: '/broker/w/newsletter',
      viewport: '1440x900',
      fontScale: 'xlarge',
      aboveFoldActionCount: 10,
      totalVisibleInteractiveCount: 20,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 0,
      contentSuitabilityViolationsCount: 0,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: true,
      artifactValid: true,
      honestSaveVisible: true,
    });

    const report = buildUnifiedCreReport100({
      imRuns: [imClean],
      newsletterRuns: [nlClean],
      dealcardRuns: [cleanRun, blindLeakRun],
      dealcardBacklog: rankDealCardPpgtBacklog([cleanRun, blindLeakRun]),
    });

    expect(report.subsystems.im.effectiveScore100).toBe(100);
    expect(report.subsystems.newsletter.effectiveScore100).toBe(100);
    expect(report.subsystems.dealcard.effectiveScore100).toBeLessThanOrEqual(FLOOR_CAP_100);
    expect(report.overallEffectiveMean100).toBeLessThanOrEqual(FLOOR_CAP_100);
    expect(report.readyForHuman2nd).toBe(false);
    expect(report.topBacklog[0].issueKey).toBe('blind_address_or_tenant_leak');
  });

  it('accurately detects Korean josa errors, banned terms, and poison tokens without false positives on CRE nouns', () => {
    const cleanCreProse =
      '서초구 근린상가 매물의 매매가 대비 임대료 추이와 평당가 차이를 가을 시장 브리핑에 담았습니다.';
    expect(scanUxWriting(cleanCreProse).clean).toBe(true);

    const flawedCopy =
      '호산당빌딩를 선택하고 딜카드을(를) 바텀시트에서 보냈더니 NaN% 수익률의… 오류가 났습니다.';
    const res = scanUxWriting(flawedCopy);
    expect(res.clean).toBe(false);
    expect(res.bannedTermCount).toBeGreaterThanOrEqual(1); // 바텀시트
    expect(res.josaViolationCount).toBeGreaterThanOrEqual(2); // 빌딩를, 을(를)
    expect(res.poisonTokenCount).toBeGreaterThanOrEqual(1); // NaN%
    expect(res.truncationViolationCount).toBeGreaterThanOrEqual(1); // 수익률의…
  });

  it('audits DealCard, Newsletter, and IM content suitability rules deterministically', () => {
    const dcRes = auditDealCardContentSuitability({
      renderedText: '역삼동 823-12 코너 근생 양호한 수익률 연면적 440평',
      headline: '양호한 수익률 코너 근생',
      areaBadgeText: '연면적 440평',
      points: ['연면적 440평', '역세권 도보 3분', '코너 입지 가시성'],
      posture: 'value_add',
      forbiddenPublicTokens: ['823-12'],
      expectThreeTierSpecsOnDetail: true,
    });
    expect(dcRes.passed).toBe(false);
    expect(dcRes.blindLeakCount).toBe(1);
    expect(dcRes.numericSpinCount).toBeGreaterThanOrEqual(1);
    expect(dcRes.duplicateAreaCount).toBe(1);
    expect(dcRes.postureAreaMismatch).toBe(true);
    expect(dcRes.threeTierSpecMissingCount).toBe(3);

    const nlRes = auditNewsletterContentSuitability({
      editionType: 'monthly',
      renderedHtml: '<div class="bg-[#0F172A]"><a href="/dc/abc">매물</a></div>',
      renderedText: '한국부동산원 R-ONE 기준 지가변동률 동향 · 지인에게 부동산뉴스 공유하기',
      expectedDealCount: 1,
      isSubscriberMode: true,
    });
    expect(nlRes.passed).toBe(true);

    const imRes = auditImContentSuitability({
      tier: 'basic',
      posture: 'income_producing',
      pptxSlideXmls: [
        '<p:sld><a:t>마포구 동교동 더파크 (근린생활시설, 125억)</a:t></p:sld>',
        '<p:sld><a:t>투자 요약</a:t></p:sld>',
        '<p:sld><a:t>외관 사진</a:t></p:sld>',
        '<p:sld><a:t>입지 4대 등급</a:t></p:sld>',
        '<p:sld><a:t>토지이음 기준 토지이용계획</a:t></p:sld>',
        '<p:sld><a:t>보증금</a:t><a:t>임대료</a:t><a:t>4F</a:t><a:t>1F</a:t><a:t>B1</a:t></p:sld>',
        '<p:sld><a:t>기대수익률(추정수익률) 4.5%</a:t></p:sld>',
      ],
      slidesHtmlExport: '<style>@page { size: 297mm 167.0625mm; }</style><div>Slide</div>',
      expectedPhotoCount: 4,
    });
    expect(imRes.passed).toBe(true);
  });

  it('enforces span grounding and [SIMULATED] prefix in R3 blending', () => {
    const grounded = blendScore100WithR3({
      r2EffectiveScore100: 92,
      r2FloorRisk: false,
      r3Score5: 4.8,
      r3FloorRisk: false,
      quotedSpans: ['상세 제안서(IM) 요청'],
      observedCorpus: ['전화하기', '상세 제안서(IM) 요청', '매물 핵심 요약'],
      syntheticNarrative: '[SIMULATED] 직관적인 버튼 구성으로 즉시 이해됨',
    });
    expect(grounded.groundedAll).toBe(true);
    expect(grounded.floorRisk).toBe(false);
    expect(grounded.blendedScore100).toBeGreaterThanOrEqual(92);

    const hallucinated = blendScore100WithR3({
      r2EffectiveScore100: 92,
      r2FloorRisk: false,
      r3Score5: 5.0,
      r3FloorRisk: false,
      quotedSpans: ['존재하지 않는 버튼 문구'],
      observedCorpus: ['전화하기', '상세 제안서(IM) 요청'],
      syntheticNarrative: '[SIMULATED] 환각 인용 테스트',
    });
    expect(hallucinated.groundedAll).toBe(false);
    expect(hallucinated.floorRisk).toBe(true);
    expect(hallucinated.blendedScore100).toBeLessThanOrEqual(FLOOR_CAP_100);
  });
});
