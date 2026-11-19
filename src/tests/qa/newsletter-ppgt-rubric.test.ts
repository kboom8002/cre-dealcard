import { describe, it, expect } from 'vitest';
import {
  NEWSLETTER_PPGT_PERSONAS,
  validateNewsletterPersonaInvariants,
  scoreNewsletterPpgtRun,
  verifyNewsletterAntiSycophancyControls,
  rankNewsletterPpgtBacklog,
  formatSimulatedReaction,
  type NewsletterPpgtProbeMetrics,
} from '@/lib/qa/newsletter-ppgt-personas';

function cleanMetrics(
  personaId: NewsletterPpgtProbeMetrics['personaId'],
  overrides: Partial<NewsletterPpgtProbeMetrics> = {},
): NewsletterPpgtProbeMetrics {
  return {
    personaId,
    surface: '/broker/w/newsletter',
    viewport: '1440x900',
    fontScale: 'normal',
    aboveFoldActionCount: 10,
    totalVisibleInteractiveCount: 28,
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
    stepCount: 3,
    honestSaveVisible: true,
    ...overrides,
  };
}

describe('Newsletter PPGT-Loop Persona SSOT, Content-Weighted R2 Rubric & Anti-Sycophancy Controls', () => {
  it('enforces 6 micro-target personas & all PPGT-Loop invariants (TC21, TC23, TC34, INV-403, INV-P06/P07)', () => {
    expect(NEWSLETTER_PPGT_PERSONAS).toHaveLength(6);
    const check = validateNewsletterPersonaInvariants(NEWSLETTER_PPGT_PERSONAS);
    expect(check.violations).toEqual([]);
    expect(check.valid).toBe(true);

    expect(formatSimulatedReaction('테스트 코멘트')).toBe('[SIMULATED] 테스트 코멘트');
    expect(formatSimulatedReaction('[SIMULATED] 테스트 코멘트')).toBe('[SIMULATED] 테스트 코멘트');
  });

  it('prevents compensatory averaging via <= 2.85 floor cap on content suitability failure even when layout is spotless', () => {
    const hostileContentCleanLayout = cleanMetrics('NL-MG-03', {
      surface: '/magazine/hanseong-cre/2026-11-19',
      viewport: '390x844',
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      contentSuitabilityViolationsCount: 4,
    });
    const res = scoreNewsletterPpgtRun(hostileContentCleanLayout);
    expect(res.r1Axes.U1_first10s_clarity).toBe(5.0);
    expect(res.r1Axes.U2_visual_ergonomics).toBe(5.0);
    expect(res.floorRisk).toBe(true);
    expect(res.weightedOverall).toBeLessThanOrEqual(2.85);
    expect(res.floorReasons.some((r) => r.startsWith('hard:content_suitability_'))).toBe(true);
  });

  it('passes all 3 anti-sycophancy negative controls (NC-NL-01..NC-NL-03 score <= 2.9 & floorRisk=true)', () => {
    const nc = verifyNewsletterAntiSycophancyControls();
    expect(nc.failures).toEqual([]);
    expect(nc.passed).toBe(true);
    expect(nc.controls).toHaveLength(3);
    for (const c of nc.controls) {
      expect(c.score).toBeLessThanOrEqual(2.9);
      expect(c.floorRisk).toBe(true);
    }
  });

  it('ranks P0 floor-risk clusters above P1/P2 cognitive backlog via P-Score and splits Track 1 cleanly', () => {
    const tab2CognitiveDrift = scoreNewsletterPpgtRun(
      cleanMetrics('NL-MG-01', {
        surface: '/broker/w/newsletter#content',
        fontScale: 'xlarge',
        aboveFoldActionCount: 22,
      }),
    );
    const suitabilityBreach = scoreNewsletterPpgtRun(
      cleanMetrics('NL-MG-03', {
        surface: '/magazine/hanseong-cre/2026-11-19',
        viewport: '390x844',
        contentSuitabilityViolationsCount: 3,
      }),
    );

    const backlog = rankNewsletterPpgtBacklog([tab2CognitiveDrift, suitabilityBreach]);
    expect(backlog.length).toBeGreaterThanOrEqual(2);
    expect(backlog[0].issueKey).toBe('content_suitability_violation');
    expect(backlog[0].tier).toBe('P0_immediate');
    expect(backlog[0].track).toBe('track1_ui_gate_renderer');
    expect(backlog[0].pScore).toBeGreaterThan(backlog[backlog.length - 1].pScore);
  });
});
