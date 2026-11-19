import { describe, it, expect } from 'vitest';
import {
  IM_PPGT_PERSONAS,
  validateImPersonaInvariants,
  scoreImPpgtRun,
  verifyAntiSycophancyControls,
  rankImPpgtBacklog,
  formatSimulatedReaction,
  type ImPpgtProbeMetrics,
} from '@/lib/qa/im-ppgt-personas';

function cleanMetrics(
  personaId: ImPpgtProbeMetrics['personaId'],
  overrides: Partial<ImPpgtProbeMetrics> = {}
): ImPpgtProbeMetrics {
  return {
    personaId,
    surface: '/broker/w/im',
    viewport: '1440x900',
    fontScale: 'normal',
    aboveFoldActionCount: 9,
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
    taskCompleted: true,
    blockingModalDetected: false,
    boundaryViolationCount: 0,
    provenanceBadgeVisible: true,
    artifactValid: true,
    stepCount: 4,
    honestSaveVisible: true,
    unreviewedNoticeVisible: true,
    ...overrides,
  };
}

describe('IM PPGT-Loop Persona SSOT, Non-Compensatory Rubric & Anti-Sycophancy Controls', () => {
  it('enforces 6 micro-target personas & all PPGT-Loop invariants (TC21, TC23, TC34, INV-P06/P07)', () => {
    expect(IM_PPGT_PERSONAS).toHaveLength(6);
    const check = validateImPersonaInvariants(IM_PPGT_PERSONAS);
    expect(check.violations).toEqual([]);
    expect(check.valid).toBe(true);

    // Ensure "[SIMULATED] " prefix helper always applies
    expect(formatSimulatedReaction('hello')).toBe('[SIMULATED] hello');
    expect(formatSimulatedReaction('[SIMULATED] hello')).toBe('[SIMULATED] hello');
  });

  it('prevents compensatory averaging via <= 2.85 floor cap when 1 hard/dealbreaker axis fails', () => {
    const mobileOverflowMetrics = cleanMetrics('IM-MG-04', {
      surface: '/im-lite/sample',
      viewport: '390x844',
      fontScale: 'xlarge',
      horizontalOverflowPx: 28,
    });
    const res = scoreImPpgtRun(mobileOverflowMetrics);
    expect(res.r1Axes.U1_first10s_clarity).toBe(5.0);
    expect(res.r1Axes.C1_provenance_honesty).toBe(5.0);
    expect(res.r1Axes.C2_artifact_shareability).toBe(5.0);
    expect(res.r1Axes.C3_safe_domain_fit).toBe(5.0);
    expect(res.floorRisk).toBe(true);
    expect(res.weightedOverall).toBeLessThanOrEqual(2.85);
    expect(res.rawWeightedOverall).toBeGreaterThan(3.5);
  });

  it('passes all 3 anti-sycophancy negative controls (NC-01..NC-03 score <= 2.9 & floorRisk=true)', () => {
    const nc = verifyAntiSycophancyControls();
    expect(nc.failures).toEqual([]);
    expect(nc.passed).toBe(true);
    expect(nc.controls).toHaveLength(3);
    for (const c of nc.controls) {
      expect(c.score).toBeLessThanOrEqual(2.9);
      expect(c.floorRisk).toBe(true);
    }
  });

  it('clusters findings by (issueKey, targetFileHint) and ranks floorRisk P0 above low-impact P2 via P-Score', () => {
    const seniorOverload = scoreImPpgtRun(
      cleanMetrics('IM-MG-01', {
        surface: '/broker/w/im#specs',
        fontScale: 'xlarge',
        aboveFoldActionCount: 38,
      })
    );
    const mobileBreak = scoreImPpgtRun(
      cleanMetrics('IM-MG-04', {
        surface: '/im-lite/sample',
        viewport: '390x844',
        horizontalOverflowPx: 24,
      })
    );

    const backlog = rankImPpgtBacklog([seniorOverload, mobileBreak]);
    expect(backlog.length).toBeGreaterThanOrEqual(2);
    expect(backlog[0].issueKey).toBe('horizontal_overflow');
    expect(backlog[0].tier).toBe('P0_immediate');
    expect(backlog[0].anyFloorRisk).toBe(true);
    expect(backlog[0].pScore).toBeGreaterThan(backlog[1].pScore);
    expect(backlog[1].issueKey).toBe('cognitive_above_fold_overload');
    expect(backlog[1].track).toBe('track1_ui_renderer');
  });
});
