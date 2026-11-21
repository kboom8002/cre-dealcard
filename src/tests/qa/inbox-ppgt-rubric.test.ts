import { describe, it, expect } from 'vitest';
import {
  INBOX_PPGT_PERSONAS,
  validateInboxPersonaInvariants,
  scoreInboxPpgtRun,
  verifyInboxAntiSycophancyControls,
  rankInboxPpgtBacklog,
  type InboxPpgtProbeMetrics,
} from '@/lib/qa/inbox-ppgt-personas';
import {
  buildUnifiedCreReport100,
  formatUnifiedCreScorecardMarkdown,
  FLOOR_CAP_100,
} from '@/lib/qa/unified-cre-rubric';
import { scoreImPpgtRun } from '@/lib/qa/im-ppgt-personas';
import { scoreNewsletterPpgtRun } from '@/lib/qa/newsletter-ppgt-personas';
import { scoreDealCardPpgtRun } from '@/lib/qa/dealcard-ppgt-personas';

function cleanInboxMetrics(
  personaId: InboxPpgtProbeMetrics['personaId'],
  overrides: Partial<InboxPpgtProbeMetrics> = {},
): InboxPpgtProbeMetrics {
  return {
    personaId,
    surface: '/broker/w/inbox',
    viewport: '1440x900',
    fontScale: 'normal',
    aboveFoldActionCount: 12,
    totalVisibleInteractiveCount: 22,
    horizontalOverflowPx: 0,
    sub44ButtonsCount: 0,
    sub15TextsCount: 0,
    clippedButtonsCount: 0,
    brokenImgCount: 0,
    consoleErrorCount: 0,
    pageErrorCount: 0,
    poisonTokenCount: 0,
    bannedTermCount: 0,
    unblockedImDispatchCount: 0,
    crmSafetyViolationCount: 0,
    dishonestTimelineOrStaleAiCount: 0,
    uxWritingViolationsCount: 0,
    taskCompleted: true,
    blockingModalDetected: false,
    boundaryViolationCount: 0,
    provenanceBadgeVisible: true,
    artifactValid: true,
    honestSaveVisible: true,
    ...overrides,
  };
}

describe('Inbox PPGT-Loop Persona SSOT & 4-Subsystem Unified 100pt Rubric', () => {
  it('enforces 4 Inbox personas & all PPGT-Loop invariants (TC21, TC23, TC34, INV-403, INV-P06/P07)', () => {
    expect(INBOX_PPGT_PERSONAS).toHaveLength(4);
    const check = validateInboxPersonaInvariants(INBOX_PPGT_PERSONAS);
    expect(check.violations).toEqual([]);
    expect(check.valid).toBe(true);
    for (const p of INBOX_PPGT_PERSONAS) {
      const score = scoreInboxPpgtRun(cleanInboxMetrics(p.id));
      expect(score.syntheticSummary.startsWith('[SIMULATED] ')).toBe(true);
      expect(score.floorRisk).toBe(false);
      expect(score.weightedOverall).toBe(5);
    }
  });

  it('passes all 3 Inbox anti-sycophancy negative controls (NC-IB-01..03 <= 2.9 & floorRisk=true)', () => {
    const nc = verifyInboxAntiSycophancyControls();
    expect(nc.failures).toEqual([]);
    expect(nc.passed).toBe(true);
    expect(nc.controls).toHaveLength(3);
    for (const c of nc.controls) {
      expect(c.score).toBeLessThanOrEqual(2.9);
      expect(c.floorRisk).toBe(true);
    }
  });

  it('caps Inbox & overall 4-subsystem score at <= 46.25/100 when an unblocked IM dispatch occurs', () => {
    const cleanInbox = scoreInboxPpgtRun(cleanInboxMetrics('IB-MG-01'));
    const unblockedRun = scoreInboxPpgtRun(
      cleanInboxMetrics('IB-MG-03', {
        surface: '/api/broker/inbox/dispatch',
        unblockedImDispatchCount: 1,
      }),
    );
    expect(unblockedRun.floorRisk).toBe(true);
    expect(unblockedRun.weightedOverall).toBeLessThanOrEqual(2.85);

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
    const dcClean = scoreDealCardPpgtRun({
      personaId: 'DC-MG-01',
      surface: '/broker/w/dealcards',
      viewport: '1440x900',
      fontScale: 'normal',
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
      blindLeakCount: 0,
      taskCompleted: true,
      blockingModalDetected: false,
      boundaryViolationCount: 0,
      provenanceBadgeVisible: true,
      artifactValid: true,
      honestSaveVisible: true,
    });

    const reportBlocked = buildUnifiedCreReport100({
      imRuns: [imClean],
      newsletterRuns: [nlClean],
      dealcardRuns: [dcClean],
      inboxRuns: [cleanInbox, unblockedRun],
      inboxBacklog: rankInboxPpgtBacklog([cleanInbox, unblockedRun]),
    });

    expect(reportBlocked.subsystems.inbox).toBeDefined();
    expect(reportBlocked.subsystems.inbox!.effectiveScore100).toBeLessThanOrEqual(FLOOR_CAP_100);
    expect(reportBlocked.overallEffectiveMean100).toBeLessThanOrEqual(FLOOR_CAP_100);
    expect(reportBlocked.readyForHuman2nd).toBe(false);
    expect(reportBlocked.topBacklog[0].issueKey).toBe('unblocked_im_not_generated_dispatch');

    const reportReady = buildUnifiedCreReport100({
      imRuns: [imClean],
      newsletterRuns: [nlClean],
      dealcardRuns: [dcClean],
      inboxRuns: [cleanInbox],
      r3Inputs: {
        im: {
          model: 'gpt-4o',
          calls: 2,
          promptTokens: 1000,
          completionTokens: 200,
          estimatedCostUsd: 0.01,
          negativeControlsPassed: true,
          groundedRatio: 1,
          uiPersonaR3Mean5: 4.8,
          deliverableR3Score5: 4.8,
          r3FloorRisk: false,
        },
        newsletter: {
          model: 'gpt-4o',
          calls: 2,
          promptTokens: 1000,
          completionTokens: 200,
          estimatedCostUsd: 0.01,
          negativeControlsPassed: true,
          groundedRatio: 1,
          uiPersonaR3Mean5: 4.8,
          deliverableR3Score5: 4.8,
          r3FloorRisk: false,
        },
        dealcard: {
          model: 'gpt-4o',
          calls: 2,
          promptTokens: 1000,
          completionTokens: 200,
          estimatedCostUsd: 0.01,
          negativeControlsPassed: true,
          groundedRatio: 1,
          uiPersonaR3Mean5: 4.8,
          deliverableR3Score5: 4.8,
          r3FloorRisk: false,
        },
        inbox: {
          model: 'gpt-4o',
          calls: 2,
          promptTokens: 1000,
          completionTokens: 200,
          estimatedCostUsd: 0.01,
          negativeControlsPassed: true,
          groundedRatio: 1,
          uiPersonaR3Mean5: 4.8,
          deliverableR3Score5: 4.8,
          r3FloorRisk: false,
        },
      },
    });
    expect(reportReady.readyForHuman2nd).toBe(true);
    expect(reportReady.r3Audit?.subsystems.inbox?.meetsBlendedTarget90).toBe(true);

    const md = formatUnifiedCreScorecardMarkdown(reportReady);
    expect(md).toContain('CRE 4대 서브시스템');
    expect(md).toContain('| **INBOX** |');
  });
});
