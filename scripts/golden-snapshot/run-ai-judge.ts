/**
 * @file scripts/golden-snapshot/run-ai-judge.ts
 * @description Ring 2 Unified AI Judge & Sealed Hold-Out CLI (`R1 + R2` $0 default + opt-in `--with-llm-judge` R3).
 *
 * Pipeline Steps:
 *  - Step A: Anti-Sycophancy Gate across all 4 subsystems (`im`, `newsletter`, `dealcard`, `inbox`).
 *            Halts immediately (`exit 1`) if any negative control scores `> 2.9` or `!floorRisk`.
 *  - Step B: Deterministic `$0` Tuning Set (22 Showcase + Inbox 4 Personas) vs Sealed Hold-Out
 *            (`docs/finaltest/testdata/ground_truth_5cases.json` when present locally; gracefully skipped on CI).
 *            Verifies `expectedOracle` net/gross yield math via `computeNoiCapRatePct` / `computeGrossYieldPct`,
 *            occupancy & totals via `lease-vacancy` + TSV/XLSX parsers, and `checkedForbiddenTokens` via `enforceBlindGuard`.
 *            Computes `generalizationGap5 = |tuningMean5 - holdOutMean5|` and flags `overfittingWarning: gap > 0.35`.
 *  - Step C: Opt-in Cross-Model Span-Grounded `R3` Judge (`--with-llm-judge`):
 *            Default mode makes 0 LLM calls (`$0.00`). When `--with-llm-judge` is explicitly passed, enforces
 *            Fail-Loud boundary on missing/mock/401/404/empty OpenAI responses, runs `AI_MODEL_SOL || 'gpt-5.6-sol'`
 *            (`maxTokens: 2800`, JSON mode), enforces `"[SIMULATED] "` prefix, validates `isSpanGrounded`
 *            (`groundedRatio >= 0.5` & `|R3 - R2| < 2.0`), blends `0.70 * R2 + 0.30 * R3`, and applies
 *            `FLOOR_CAP_5 = 2.85` (`FLOOR_CAP_100 = 46.25`) whenever `floorRisk` is true.
 *  - Step D: Writes `e2e/golden-snapshots/out/ai-golden-judge-report.{json,md}` with Tuning score,
 *            Hold-Out score, Generalization Gap, Prompt Hash status, and `P-Score`-sorted backlog.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

import {
  FLOOR_CAP_100,
  buildUnifiedCreReport100,
  formatUnifiedCreScorecardMarkdown,
  isSpanGrounded as rubricIsSpanGrounded,
  type CreSubsystemId,
  type LayerDR3SubsystemInput,
  type UnifiedBacklogItem,
  type UnifiedCreReport100,
} from '../../src/lib/qa/unified-cre-rubric';
import {
  IM_PPGT_PERSONAS,
  formatSimulatedReaction,
  rankImPpgtBacklog,
  scoreImPpgtRun,
  validateImPersonaInvariants,
  verifyAntiSycophancyControls as verifyImAntiSycophancyControls,
  type ImPpgtIssueHint,
  type ImPpgtScoreResult,
} from '../../src/lib/qa/im-ppgt-personas';
import {
  NEWSLETTER_PPGT_PERSONAS,
  rankNewsletterPpgtBacklog,
  scoreNewsletterPpgtRun,
  validateNewsletterPersonaInvariants,
  verifyNewsletterAntiSycophancyControls,
  type NewsletterPpgtIssueHint,
  type NewsletterPpgtScoreResult,
} from '../../src/lib/qa/newsletter-ppgt-personas';
import {
  DEALCARD_PPGT_PERSONAS,
  rankDealCardPpgtBacklog,
  scoreDealCardPpgtRun,
  validateDealCardPersonaInvariants,
  verifyDealCardAntiSycophancyControls,
  type DealCardPpgtIssueHint,
  type DealCardPpgtScoreResult,
} from '../../src/lib/qa/dealcard-ppgt-personas';
import {
  INBOX_PPGT_PERSONAS,
  rankInboxPpgtBacklog,
  scoreInboxPpgtRun,
  validateInboxPersonaInvariants,
  verifyInboxAntiSycophancyControls,
  type InboxPpgtScoreResult,
} from '../../src/lib/qa/inbox-ppgt-personas';
import {
  DEALCARD_SHOWCASE_8,
  IM_SHOWCASE_8,
  NEWSLETTER_SHOWCASE_6,
  type ShowcaseDealCardScenario,
  type ShowcaseImScenario,
  type ShowcaseNewsletterScenario,
} from '../../src/lib/qa/output-showcase-scenarios';
import {
  auditDealCardContentSuitability,
  scanUxWriting,
} from '../../src/lib/qa/ux-writing-and-content-oracle';
import {
  cleanBlindPoints,
  validateBlindPoints,
} from '../../src/lib/deal-card/blind-guard';
import { parseMemoIntoCard4 } from '../../src/lib/deal-card/memo-pairing';
import { buildDeal3TierSpecs } from '../../src/lib/deal-card/field-strength-tags';
import {
  resolveLeaseOccupancy,
  sumLeasedRentRoll,
  summarizeLeaseOccupancy,
} from '../../src/domain/building/mobile-im/lease-vacancy';
import {
  parseTsvRentRoll,
  synthesizeMissingVacantFloors,
} from '../../src/lib/rent-roll/tsv-parser';
import { parseRentRollWorkbook } from '../../src/lib/rentroll/parse-rentroll-workbook';
import { buildSlidesHtmlExport } from '../../src/lib/im-lite/slides-html-builder';
import {
  MONTHLY_GRAPHIC_PAIR_PRESETS,
  hydrateMonthlyChartsFromRpcRows,
} from '../../src/domain/magazine/monthly-stats-hydration';
import { getModel } from '../../src/ai/model-selector';
import type { LLMChatParams, LLMChatResult } from '../../src/ai/providers/types';
import type { toPublicDealCard as ToPublicDealCardFn } from '../../src/domain/public-projection/deal-card';

import {
  DEFAULT_MANIFEST_PATH,
  DEFAULT_ROOT_DIR,
  computeCurrentPromptHashes,
  diffPromptManifest,
  loadPromptManifest,
  type PromptManifestDiff,
} from './prompt-hash-guard';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(SCRIPT_DIR, '..', '..');

function ensurePublicEnvFallbacksForOfflineCli(): void {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://mock-supabase.local';
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
  }
}

let cachedEnvBoundHelpers: {
  computeNoiCapRatePct: (
    monthlyRentManwon: number,
    askingPriceManwon: number,
    opexRate?: number,
  ) => number;
  computeGrossYieldPct: (
    monthlyRentManwon: number,
    askingPriceManwon: number,
    depositTotalManwon?: number,
  ) => number;
  calculateCost: (model: string, inputTokens: number, outputTokens: number) => number;
  toPublicDealCard: typeof ToPublicDealCardFn;
} | null = null;

async function getEnvBoundHelpers() {
  if (cachedEnvBoundHelpers) return cachedEnvBoundHelpers;
  ensurePublicEnvFallbacksForOfflineCli();
  const [patchUpsertMod, costTrackerMod, publicDealCardMod] = await Promise.all([
    import('../../src/lib/workspace/summary/patch-upsert-im'),
    import('../../src/ai/cost-tracker'),
    import('../../src/domain/public-projection/deal-card'),
  ]);
  cachedEnvBoundHelpers = {
    computeNoiCapRatePct: patchUpsertMod.computeNoiCapRatePct,
    computeGrossYieldPct: patchUpsertMod.computeGrossYieldPct,
    calculateCost: costTrackerMod.calculateCost,
    toPublicDealCard: publicDealCardMod.toPublicDealCard,
  };
  return cachedEnvBoundHelpers;
}
export const DEFAULT_GROUND_TRUTH_PATH = path.join(
  ROOT_DIR,
  'docs',
  'finaltest',
  'testdata',
  'ground_truth_5cases.json',
);
export const DEFAULT_OUT_DIR = path.join(ROOT_DIR, 'e2e', 'golden-snapshots', 'out');

export const FLOOR_CAP_5 = 2.85 as const;
export { FLOOR_CAP_100 };
export const OVERFITTING_GAP_THRESHOLD_5 = 0.35 as const;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Verifies whether `quotedSpan` appears verbatim (whitespace-normalized, >= 2 chars)
 * inside `observedTextOrCorpus`. Accepts either a single string or an array of observed strings.
 */
export function isSpanGrounded(
  quotedSpan: string,
  observedTextOrCorpus: string | readonly string[],
): boolean {
  const corpus =
    typeof observedTextOrCorpus === 'string'
      ? [observedTextOrCorpus]
      : observedTextOrCorpus;
  return rubricIsSpanGrounded(quotedSpan, corpus);
}

// ============================================================================
// STEP A: ANTI-SYCOPHANCY GATE (4 SUBSYSTEMS)
// ============================================================================

export interface SubsystemAntiSycophancySummary {
  passed: boolean;
  invariantsValid: boolean;
  controls: Array<{ controlId: string; score: number; floorRisk: boolean; reasons: string[] }>;
  failures: string[];
}

export interface AntiSycophancyGateResult {
  passed: boolean;
  subsystems: Record<CreSubsystemId, SubsystemAntiSycophancySummary>;
  failures: string[];
}

export function runAntiSycophancyGate(): AntiSycophancyGateResult {
  const imNc = verifyImAntiSycophancyControls();
  const nlNc = verifyNewsletterAntiSycophancyControls();
  const dcNc = verifyDealCardAntiSycophancyControls();
  const ibNc = verifyInboxAntiSycophancyControls();

  const imInv = validateImPersonaInvariants(IM_PPGT_PERSONAS);
  const nlInv = validateNewsletterPersonaInvariants(NEWSLETTER_PPGT_PERSONAS);
  const dcInv = validateDealCardPersonaInvariants(DEALCARD_PPGT_PERSONAS);
  const ibInv = validateInboxPersonaInvariants(INBOX_PPGT_PERSONAS);

  const buildSub = (
    sub: CreSubsystemId,
    nc: {
      passed: boolean;
      controls: Array<{ controlId: string; score: number; floorRisk: boolean; reasons: string[] }>;
      failures: string[];
    },
    inv: { valid: boolean; violations: string[] },
  ): SubsystemAntiSycophancySummary => {
    const extraControlFailures: string[] = [];
    for (const c of nc.controls) {
      if (c.score > 2.9 || !c.floorRisk) {
        const msg = `${sub}:${c.controlId} failed anti-sycophancy gate (score=${c.score}, floorRisk=${c.floorRisk})`;
        if (!nc.failures.includes(msg)) extraControlFailures.push(msg);
      }
    }
    const subFailures = [
      ...nc.failures,
      ...extraControlFailures,
      ...inv.violations.map((v) => `${sub}:invariant:${v}`),
    ];
    return {
      passed: nc.passed && extraControlFailures.length === 0 && inv.valid,
      invariantsValid: inv.valid,
      controls: nc.controls,
      failures: subFailures,
    };
  };

  const subsystems: Record<CreSubsystemId, SubsystemAntiSycophancySummary> = {
    im: buildSub('im', imNc, imInv),
    newsletter: buildSub('newsletter', nlNc, nlInv),
    dealcard: buildSub('dealcard', dcNc, dcInv),
    inbox: buildSub('inbox', ibNc, ibInv),
  };

  const failures = (Object.keys(subsystems) as CreSubsystemId[]).flatMap(
    (k) => subsystems[k].failures,
  );

  return {
    passed: failures.length === 0,
    subsystems,
    failures,
  };
}

// ============================================================================
// BLIND GUARD ENFORCEMENT HELPER (SHARED BY TUNING & SEALED HOLD-OUT)
// ============================================================================

export interface EnforceBlindGuardInput {
  rawMemoText: string;
  forbiddenTokens: readonly string[];
  buildingId?: string;
  address?: string;
  askingPriceManwon?: number;
  landAreaSqm?: number;
  gfaSqm?: number;
  zoning?: string;
  completionDate?: string;
  rentRoll?: ReadonlyArray<{
    depositManwon: number;
    monthlyRentManwon: number;
    status?: string;
  }>;
  mainUsage?: string;
  postureHint?: 'income' | 'owner_occupied' | 'value_add';
}

export interface EnforceBlindGuardResult {
  passed: boolean;
  leakedTokens: string[];
  parsedRegion: string;
  parsedUse: string;
  parsedPriceBand: string;
  cleanedPoints: string[];
  publicRenderedText: string;
  publicNarrativeText: string;
}

export function enforceBlindGuard(input: EnforceBlindGuardInput): EnforceBlindGuardResult {
  const parsed = parseMemoIntoCard4(
    input.rawMemoText,
    input.postureHint ? { posture: input.postureHint } : undefined,
  );
  const cleanedPoints = cleanBlindPoints(parsed.points);
  const blindValidation = validateBlindPoints(cleanedPoints, {
    region: parsed.region,
    assetType: parsed.use,
  });
  const finalPoints = blindValidation.cleanedPoints;
  const card4 = { ...parsed, points: finalPoints };
  const buildingId = input.buildingId || '00000000-0000-4000-8000-000000000099';
  const askingManwon = input.askingPriceManwon ?? 0;

  let publicNarrativeText: string;
  let publicRenderedText: string;
  let dealPointsOut: string[];

  if (cachedEnvBoundHelpers?.toPublicDealCard) {
    const occupiedRows = (input.rentRoll ?? []).filter((r) => r.status !== 'vacant');
    const totalDepositManwon = occupiedRows.reduce((s, r) => s + (r.depositManwon || 0), 0);
    const totalRentManwon = occupiedRows.reduce((s, r) => s + (r.monthlyRentManwon || 0), 0);

    const publicDto = cachedEnvBoundHelpers.toPublicDealCard({
      id: buildingId,
      building: {
        id: buildingId,
        address: input.address || '',
        raw_address: input.address || '',
        asking_price_manwon: askingManwon,
        land_area_sqm: input.landAreaSqm,
        total_area_sqm: input.gfaSqm,
        zoning: input.zoning,
        completion_date: input.completionDate,
        main_usage: input.mainUsage || parsed.use || '근린생활시설',
        attrs: {
          address: input.address || '',
          askingPrice: askingManwon > 0 ? askingManwon * 10_000 : null,
          landAreaSqm: input.landAreaSqm,
          totalFloorAreaSqm: input.gfaSqm,
          zoning: input.zoning,
          completionDate: input.completionDate,
          ...(totalRentManwon > 0 ? { monthlyRentKrw: totalRentManwon * 10_000 } : {}),
          ...(totalDepositManwon > 0 ? { depositKrw: totalDepositManwon * 10_000 } : {}),
        },
      },
      signalCard: {
        title: card4.headline,
        area_signal: card4.region,
        asset_type: card4.use,
        price_band: card4.priceBand,
        body: { card4 },
      },
      teaserDoc: {
        body: { card4 },
      },
      brokerProfile: {
        display_name: '이상은',
        company: '크리딜 파트너스 공인중개사사무소',
        phone: '010-2548-2548',
        office_address: '서울특별시 강남구 테헤란로 142',
        office_reg_number: '11680-2024-00881',
        representative_name: '이상은',
        is_licensed: true,
      },
      hasImDoc: true,
      isPptxApproved: true,
      pptxDownloadUrl: `/api/public/im-lite/${buildingId}/pptx`,
    });

    const specLines = [
      ...publicDto.threeTierSpecs.commonSpecs.map((x) => `${x.label} ${x.value}`),
      ...publicDto.threeTierSpecs.buildingSpecs.map((x) => `${x.label} ${x.value}`),
      ...publicDto.threeTierSpecs.purposeSpecs.map((x) => `${x.label} ${x.value}`),
    ].join(' · ');

    dealPointsOut = publicDto.dealPoints;
    publicNarrativeText = [
      publicDto.hero.regionLabel,
      publicDto.hero.title,
      publicDto.hero.hookCopy,
      publicDto.og.title,
      publicDto.og.description,
      ...publicDto.dealPoints,
    ]
      .filter(Boolean)
      .join(' | ');

    publicRenderedText = [
      '매물 핵심 요약',
      publicNarrativeText,
      publicDto.postureWidget.assetType,
      publicDto.hero.bandedArea,
      publicDto.hero.bandedPrice,
      specLines,
      publicDto.broker.displayName,
      publicDto.broker.officeName || '',
      publicDto.broker.officeRegNumber || '',
    ]
      .filter(Boolean)
      .join(' | ');
  } else {
    const rawHeadline = card4.headline || '';
    const rawRegion = card4.region || '';
    const cleanHead = cleanBlindPoints([rawHeadline])[0] || rawHeadline;
    const cleanReg = cleanBlindPoints([rawRegion])[0] || rawRegion;
    const specs = buildDeal3TierSpecs({
      posture: card4.posture || 'income',
      priceDisplay: card4.priceBand,
      landAreaDisplay: input.landAreaSqm ? `${Math.round(input.landAreaSqm / 3.3058)}평대` : null,
      gfaDisplay: input.gfaSqm ? `${Math.round(input.gfaSqm / 3.3058)}평대` : null,
    });
    const specLines = [
      ...specs.commonSpecs.map((x) => `${x.label} ${x.value}`),
      ...specs.buildingSpecs.map((x) => `${x.label} ${x.value}`),
      ...specs.purposeSpecs.map((x) => `${x.label} ${x.value}`),
    ].join(' · ');

    dealPointsOut = finalPoints;
    publicNarrativeText = [cleanReg, cleanHead, ...finalPoints].filter(Boolean).join(' | ');
    publicRenderedText = [
      '매물 핵심 요약',
      publicNarrativeText,
      card4.use,
      card4.area || '',
      card4.priceBand,
      specLines,
      '이상은 | 크리딜 파트너스 공인중개사사무소 | 11680-2024-00881',
    ]
      .filter(Boolean)
      .join(' | ');
  }

  const leakedTokens: string[] = [];
  for (const rawTok of input.forbiddenTokens) {
    const tok = String(rawTok || '').trim();
    if (!tok) continue;
    if (/^\d+$/.test(tok)) {
      const numRe = new RegExp(`(?<!\\d)${escapeRegExp(tok)}(?!\\d)`);
      if (numRe.test(publicNarrativeText)) {
        leakedTokens.push(tok);
      }
    } else if (publicRenderedText.includes(tok)) {
      leakedTokens.push(tok);
    }
  }

  const finalRecheck = validateBlindPoints(dealPointsOut, {
    region: card4.region,
    assetType: card4.use,
  });

  return {
    passed: leakedTokens.length === 0 && finalRecheck.isValid,
    leakedTokens,
    parsedRegion: card4.region,
    parsedUse: card4.use,
    parsedPriceBand: card4.priceBand,
    cleanedPoints: dealPointsOut,
    publicRenderedText,
    publicNarrativeText,
  };
}

// ============================================================================
// STEP B-1: DETERMINISTIC TUNING SET EVALUATION ($0, 0 NETWORK CALLS)
// ============================================================================

export interface TuningEvaluationResult {
  imRuns: ImPpgtScoreResult[];
  newsletterRuns: NewsletterPpgtScoreResult[];
  dealcardRuns: DealCardPpgtScoreResult[];
  inboxRuns: InboxPpgtScoreResult[];
  tuningMean5: number;
  unifiedReport: UnifiedCreReport100;
  observedCorpus: string[];
}

function evaluateTuningDealCardScenario(
  sc: ShowcaseDealCardScenario,
  corpus: string[],
): DealCardPpgtScoreResult {
  const blindRes = enforceBlindGuard({
    rawMemoText: sc.fastFillMemo,
    forbiddenTokens: sc.forbiddenPublicTokens,
    buildingId: sc.buildingId,
    address: sc.address,
    askingPriceManwon: sc.askingPriceManwon,
    landAreaSqm: sc.landAreaSqm,
    gfaSqm: sc.gfaSqm,
    zoning: sc.zoning,
    completionDate: sc.completionDate,
    rentRoll: sc.rentRoll,
    mainUsage: sc.posture === 'owner_occupier' ? '업무시설' : '근린생활시설',
    postureHint: sc.card4Posture,
  });
  corpus.push(`[DEALCARD:${sc.id}] ${blindRes.publicRenderedText}`);

  const writing = scanUxWriting(blindRes.publicRenderedText);
  const suitability = auditDealCardContentSuitability({
    renderedText: blindRes.publicRenderedText,
    headline: blindRes.publicNarrativeText.split('|')[1]?.trim() || sc.title,
    areaBadgeText: blindRes.publicRenderedText,
    points: blindRes.cleanedPoints,
    posture: sc.card4Posture,
    forbiddenPublicTokens: sc.forbiddenPublicTokens,
    expectThreeTierSpecsOnDetail: true,
  });

  const hints: DealCardPpgtIssueHint[] = [];
  for (const det of suitability.details) {
    hints.push({
      issueKey: det.split(':')[0] || 'dealcard_suitability',
      targetFileHint: 'src/domain/public-projection/deal-card.ts',
      axis: det.startsWith('blind_leak') ? 'C3_safe_domain_fit' : 'C1_provenance_honesty',
      track: 'track1_ui_gate_renderer',
      summary: `${sc.id}: ${det}`,
    });
  }

  const personaId =
    sc.id === 'DC-07'
      ? 'DC-MG-02'
      : sc.id === 'DC-08'
        ? 'DC-MG-06'
        : sc.card4Posture === 'owner_occupied'
          ? 'DC-MG-04'
          : sc.card4Posture === 'value_add'
            ? 'DC-MG-05'
            : 'DC-MG-03';

  return scoreDealCardPpgtRun({
    personaId,
    surface: `tuning:${sc.id}`,
    viewport: '390x844',
    fontScale: sc.id === 'DC-01' || sc.id === 'DC-06' ? 'xlarge' : 'normal',
    aboveFoldActionCount: 8,
    totalVisibleInteractiveCount: 14,
    horizontalOverflowPx: 0,
    sub44ButtonsCount: 0,
    sub15TextsCount: 0,
    clippedButtonsCount: 0,
    brokenImgCount: 0,
    consoleErrorCount: 0,
    pageErrorCount: 0,
    poisonTokenCount: writing.poisonTokenCount,
    bannedTermCount: writing.bannedTermCount,
    blindLeakCount: blindRes.leakedTokens.length + suitability.blindLeakCount,
    numericSpinCount: suitability.numericSpinCount,
    threeTierSpecMissingCount: suitability.threeTierSpecMissingCount,
    uxWritingViolationsCount: writing.josaViolationCount + writing.truncationViolationCount,
    contentSuitabilityViolationsCount: suitability.duplicateAreaCount,
    taskCompleted: true,
    blockingModalDetected: false,
    boundaryViolationCount: blindRes.passed ? 0 : 1,
    provenanceBadgeVisible: true,
    artifactValid: blindRes.publicRenderedText.length > 40,
    honestSaveVisible: true,
    issueHints: hints,
  });
}

function evaluateTuningNewsletterScenario(
  sc: ShowcaseNewsletterScenario,
  corpus: string[],
): NewsletterPpgtScoreResult {
  const pairPreset =
    MONTHLY_GRAPHIC_PAIR_PRESETS.find((p) => p.id === (sc.monthlyPair ?? 'molit_bok')) ??
    MONTHLY_GRAPHIC_PAIR_PRESETS[0];
  const monthlyCharts =
    sc.editionType === 'monthly'
      ? hydrateMonthlyChartsFromRpcRows({
          regionKey: sc.monthlyRegion ?? 'gbd',
          pair: pairPreset.pair,
          rpcRows: [],
        })
      : [];

  const dealSummaries: string[] = [];
  const dealBlindLeaks: string[] = [];
  for (const refId of sc.dealRefs) {
    const dc = DEALCARD_SHOWCASE_8.find((d) => d.id === refId);
    if (!dc) continue;
    const blindRes = enforceBlindGuard({
      rawMemoText: dc.fastFillMemo,
      forbiddenTokens: dc.forbiddenPublicTokens,
      buildingId: dc.buildingId,
      address: dc.address,
      askingPriceManwon: dc.askingPriceManwon,
      landAreaSqm: dc.landAreaSqm,
      gfaSqm: dc.gfaSqm,
      postureHint: dc.card4Posture,
    });
    dealSummaries.push(`${blindRes.parsedRegion} ${blindRes.parsedUse} ${blindRes.parsedPriceBand}`);
    if (!blindRes.passed) {
      dealBlindLeaks.push(...blindRes.leakedTokens.map((t) => `${sc.id}:${refId}:${t}`));
    }
  }

  const headline = sc.useBrokerNamePreset
    ? `이상은 중개사의 ${sc.headlineTemplate}`
    : sc.headlineTemplate;
  const chartText = monthlyCharts
    .map(
      (c) =>
        `${c.title} (출처: ${c.privateResearchSource || '국토교통부 실거래가 공개시스템 · 한국은행 ECOS'})`,
    )
    .join(' · ');
  const issueText = sc.unitIssues.map((u) => `[${u.topic}] ${u.title} — ${u.brief}`).join(' | ');
  const combinedText = [
    headline,
    sc.plainBriefingFallback,
    chartText,
    issueText,
    ...dealSummaries,
    '데이터 기준: 국토교통부 상업·업무용 실거래가 공개시스템 및 한국은행 ECOS 기준금리 공표치',
    'CREDEAL 안심 매거진 · 이상은 · 크리딜 파트너스 공인중개사사무소 · 등록번호 11680-2024-00881 · 서울특별시 강남구 테헤란로 142 · 010-2548-2548',
  ]
    .filter(Boolean)
    .join(' \n ');

  corpus.push(`[NEWSLETTER:${sc.id}] ${combinedText}`);
  const writing = scanUxWriting(combinedText);

  for (const refId of sc.dealRefs) {
    const dc = DEALCARD_SHOWCASE_8.find((d) => d.id === refId);
    for (const tok of dc?.forbiddenPublicTokens ?? []) {
      if (tok && sc.plainBriefingFallback.includes(tok)) {
        dealBlindLeaks.push(`${sc.id}:briefing:${tok}`);
      }
    }
  }

  const hints: NewsletterPpgtIssueHint[] = [];
  if (dealBlindLeaks.length > 0) {
    hints.push({
      issueKey: 'newsletter_deal_blind_leak',
      targetFileHint: 'src/lib/magazine/view-helpers.ts',
      axis: 'C3_safe_domain_fit',
      track: 'track1_ui_gate_renderer',
      summary: `${sc.id}: 추천 매물 블라인드 유출 ${dealBlindLeaks.join(', ')}`,
    });
  }

  const personaMap: Record<
    ShowcaseNewsletterScenario['id'],
    NewsletterPpgtScoreResult['personaId']
  > = {
    'NL-D1': 'NL-MG-03',
    'NL-D2': 'NL-MG-02',
    'NL-W1': 'NL-MG-04',
    'NL-W2': 'NL-MG-02',
    'NL-M1': 'NL-MG-05',
    'NL-M2': 'NL-MG-01',
  };

  const monthlyChartsMissing =
    sc.editionType === 'monthly' && monthlyCharts.length < 2 ? 1 : 0;

  return scoreNewsletterPpgtRun({
    personaId: personaMap[sc.id],
    surface: `tuning:${sc.id}`,
    viewport: '390x844',
    fontScale: sc.defaultFontScale === 'xlarge' ? 'xlarge' : 'normal',
    aboveFoldActionCount: 6,
    totalVisibleInteractiveCount: 14,
    horizontalOverflowPx: 0,
    sub44ButtonsCount: 0,
    sub15TextsCount: 0,
    clippedButtonsCount: 0,
    brokenImgCount: 0,
    consoleErrorCount: 0,
    pageErrorCount: 0,
    poisonTokenCount: writing.poisonTokenCount,
    bannedTermCount: writing.bannedTermCount,
    contentSuitabilityViolationsCount:
      writing.josaViolationCount + writing.truncationViolationCount + monthlyChartsMissing,
    taskCompleted: true,
    blockingModalDetected: false,
    boundaryViolationCount: dealBlindLeaks.length,
    provenanceBadgeVisible: true,
    artifactValid: combinedText.length > 200,
    honestSaveVisible: true,
    issueHints: hints,
  });
}

function evaluateTuningImScenario(
  sc: ShowcaseImScenario,
  corpus: string[],
  math: {
    computeGrossYieldPct: (
      monthlyRentManwon: number,
      askingPriceManwon: number,
      depositTotalManwon?: number,
    ) => number;
    computeNoiCapRatePct: (
      monthlyRentManwon: number,
      askingPriceManwon: number,
      opexRate?: number,
    ) => number;
  },
): ImPpgtScoreResult {
  let rentRows = sc.directRentRoll ? [...sc.directRentRoll] : [];
  if (sc.rawTsv) {
    const parsed = parseTsvRentRoll(sc.rawTsv);
    const base = sc.synthesizeVacantFloors
      ? synthesizeMissingVacantFloors(parsed.rows)
      : parsed.rows;
    rentRows = base.map((r) => ({
      floor: r.floor,
      unit: r.unit,
      use: r.use || '근린생활시설',
      area_sqm: r.areaSqm,
      depositManwon: r.depositManwon,
      monthlyRentManwon: r.monthlyRentManwon,
      maintenanceManwon: r.maintenanceManwon,
      leaseExpiry: r.leaseExpiry,
      status: r.status,
    }));
  }

  const floorLeases = rentRows.map((r, idx) => ({
    floor: r.floor,
    unit: r.unit || `${idx + 1}호`,
    tenant_name: r.use,
    use: r.use,
    leasable_area_sqm: r.area_sqm ?? 80,
    deposit_manwon: r.depositManwon,
    rent_manwon: r.monthlyRentManwon,
    mgmt_fee_manwon: r.maintenanceManwon ?? 0,
    lease_expiry: r.leaseExpiry || '-',
    lease_state:
      r.status === 'vacant' ? '공실' : r.status === 'owner' ? '자가사용' : '임대중',
  }));

  const leasedTotals = sumLeasedRentRoll(floorLeases);
  const occSummary = summarizeLeaseOccupancy(floorLeases);
  const grossYieldPct = math.computeGrossYieldPct(
    leasedTotals.monthlyRentManwon,
    sc.askingPriceManwon,
    leasedTotals.depositManwon,
  );
  const noiCapPct = math.computeNoiCapRatePct(
    leasedTotals.monthlyRentManwon,
    sc.askingPriceManwon,
  );

  const imBody: Record<string, unknown> = {
    investment_posture:
      sc.posture === 'owner_occupier'
        ? 'owner_occupied'
        : sc.posture === 'development'
          ? 'development'
          : 'core_income',
    resolved_address: sc.address,
    ssot_summary: {
      address: sc.address,
      asking_price_krw: sc.askingPriceManwon * 10_000,
      asking_price_manwon: sc.askingPriceManwon,
      land_area_sqm: sc.landAreaSqm ?? 300,
      total_gross_area_sqm: sc.gfaSqm ?? 900,
      zoning: sc.zoning ?? '제2종일반주거지역',
      completion_date: sc.completionDate ?? '2018-05-01',
      main_purpose: sc.posture === 'owner_occupier' ? '업무시설' : '근린생활시설',
      total_deposit_manwon: leasedTotals.depositManwon,
      total_monthly_rent_manwon: leasedTotals.monthlyRentManwon,
      vacancy_pct: occSummary.vacancyPct,
      noi_cap_rate_pct: noiCapPct,
    },
    heroCard: {
      title: sc.deliverableTitle || sc.title,
      askingPriceDisplay: `${(sc.askingPriceManwon / 10_000).toLocaleString()}억 원`,
      grossYieldPct: grossYieldPct > 0 ? grossYieldPct : null,
      keyPoints: [sc.subtitle, sc.handoverNote],
    },
    floor_leases: floorLeases,
    photos_v2: [],
    broker_extras: sc.brokerExtras ?? {},
  };

  const slidesHtml = buildSlidesHtmlExport({
    buildingId: sc.buildingId,
    title: sc.deliverableTitle || sc.title,
    content: imBody,
    building: {
      address: sc.address,
      total_area_sqm: sc.gfaSqm,
      land_area_sqm: sc.landAreaSqm,
      zoning: sc.zoning,
    },
    brokerInfo: {
      displayName: '이상은',
      company: '크리딜 파트너스 공인중개사사무소',
      phone: '010-2548-2548',
      officeAddress: '서울특별시 강남구 테헤란로 142',
      licenseNumber: '11680-2024-00881',
    },
  });

  const plainHtmlText = stripHtmlTags(slidesHtml);
  corpus.push(`[IM:${sc.id}] ${plainHtmlText}`);
  const writing = scanUxWriting(plainHtmlText);

  const hints: ImPpgtIssueHint[] = [];
  if (writing.totalViolations > 0) {
    hints.push({
      issueKey: 'im_slides_html_writing',
      targetFileHint: 'src/lib/im-lite/slides-html-builder.ts',
      axis: 'C2_artifact_shareability',
      track: 'track1_ui_renderer',
      summary: `${sc.id}: 라이팅 결함 ${writing.violations.map((v) => v.match).join(', ')}`,
    });
  }

  const personaId =
    sc.id === 'IM-04'
      ? 'IM-MG-03'
      : sc.id === 'IM-06'
        ? 'IM-MG-05'
        : sc.id === 'IM-07' || sc.id === 'IM-08'
          ? 'IM-MG-06'
          : 'IM-MG-04';

  const zeroDivSafe = !Number.isNaN(grossYieldPct) && !Number.isNaN(noiCapPct);

  return scoreImPpgtRun({
    personaId,
    surface: `tuning:${sc.id}`,
    viewport: '1440x900',
    fontScale: 'normal',
    aboveFoldActionCount: 8,
    totalVisibleInteractiveCount: 14,
    horizontalOverflowPx: 0,
    sub44ButtonsCount: 0,
    sub15TextsCount: 0,
    clippedButtonsCount: 0,
    brokenImgCount: 0,
    consoleErrorCount: 0,
    pageErrorCount: 0,
    poisonTokenCount: writing.poisonTokenCount + (zeroDivSafe ? 0 : 1),
    bannedTermCount: writing.bannedTermCount + writing.josaViolationCount,
    taskCompleted: slidesHtml.length > 500 && zeroDivSafe,
    blockingModalDetected: false,
    boundaryViolationCount: 0,
    provenanceBadgeVisible: /건축물대장|공인중개사|수익|면적|소재지/.test(plainHtmlText),
    artifactValid: slidesHtml.length > 500 && zeroDivSafe,
    honestSaveVisible: true,
    issueHints: hints,
  });
}

function evaluateTuningInboxPersonas(corpus: string[]): InboxPpgtScoreResult[] {
  corpus.push(
    '[INBOX:REPLY-01] [박준영 대표님께 · 매물ID 5c0ca5e0-0001-4000-8000-000000000001] 문의주신 마포구 동교동 일대 경의선숲길 코너 근린생활시설 매물 상세 브리핑(IM) 전달드립니다. 현행 보증금 2억 2,000만 원 / 월 임대료 1,817만 원(건축물대장 및 5개 층 임대차 현황표 대조 완료) 기준이며, 현장 투어 희망 일정을 회신 주시면 즉시 조율하겠습니다. | 카톡 요약본(kakaoBrief): 동교동 코너 근생 IM 링크(/im-lite/5c0ca5e0-0001-4000-8000-000000000001) 및 수익률 요약 전달 완료 | CRM 안전장치: VIP 고객 삭제 2단계 보호 경고 활성 · IM 미생성 매물 발송 차단(409 IM_NOT_GENERATED) · 중복 연락처 병합 안내 · 발송 이력 타임라인 정직 기록(저장됨)',
  );
  return INBOX_PPGT_PERSONAS.map((p) =>
    scoreInboxPpgtRun({
      personaId: p.id,
      surface: `tuning:inbox:${p.id}`,
      viewport: `${p.routingAxes.viewportProfile.width}x${p.routingAxes.viewportProfile.height}`,
      fontScale: p.routingAxes.viewportProfile.fontScale,
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
    }),
  );
}

export async function evaluateTuningSet(): Promise<TuningEvaluationResult> {
  const math = await getEnvBoundHelpers();
  const observedCorpus: string[] = [];
  const dealcardRuns = DEALCARD_SHOWCASE_8.map((sc) =>
    evaluateTuningDealCardScenario(sc, observedCorpus),
  );
  const newsletterRuns = NEWSLETTER_SHOWCASE_6.map((sc) =>
    evaluateTuningNewsletterScenario(sc, observedCorpus),
  );
  const imRuns = IM_SHOWCASE_8.map((sc) =>
    evaluateTuningImScenario(sc, observedCorpus, math),
  );
  const inboxRuns = evaluateTuningInboxPersonas(observedCorpus);

  const allWeighted5 = [
    ...imRuns.map((r) => r.weightedOverall),
    ...newsletterRuns.map((r) => r.weightedOverall),
    ...dealcardRuns.map((r) => r.weightedOverall),
    ...inboxRuns.map((r) => r.weightedOverall),
  ];
  const tuningMean5 =
    allWeighted5.length > 0
      ? round2(allWeighted5.reduce((a, b) => a + b, 0) / allWeighted5.length)
      : 0;

  const unifiedReport = buildUnifiedCreReport100({
    imRuns,
    newsletterRuns,
    dealcardRuns,
    inboxRuns,
    imBacklog: rankImPpgtBacklog(imRuns),
    newsletterBacklog: rankNewsletterPpgtBacklog(newsletterRuns),
    dealcardBacklog: rankDealCardPpgtBacklog(dealcardRuns),
    inboxBacklog: rankInboxPpgtBacklog(inboxRuns),
  });

  return {
    imRuns,
    newsletterRuns,
    dealcardRuns,
    inboxRuns,
    tuningMean5,
    unifiedReport,
    observedCorpus,
  };
}

// ============================================================================
// STEP B-2: SEALED HOLD-OUT EVALUATION (`ground_truth_5cases.json`)
// ============================================================================

export interface GroundTruthCaseEntry {
  id: string;
  folderName: string;
  inputMode: string;
  jibunAddress: string;
  pnu: string;
  landAreaSqm: number;
  gfaSqm: number;
  askingPriceManwon: number;
  dealCardVerification: {
    parsedRegion: string;
    parsedUse: string;
    parsedPriceBand: string;
    blindGuardPassed: boolean;
    checkedForbiddenTokens: string[];
  };
  rentRollVerification: {
    mode: string;
    occupancySummaryAsIs?: {
      total: number;
      leased: number;
      vacant: number;
      ownerUse: number;
      nonLeasable: number;
      vacancyPct: number | null;
      vacantFloors?: string[];
    };
    asIsTotalsManwon: {
      deposit: number;
      rent: number;
      mgmt: number;
    };
    stabilizedTotalsManwon: {
      deposit: number;
      rent: number;
      mgmt: number;
    };
  };
  expectedOracle: {
    asIsDepositManwon: number;
    asIsRentManwon: number;
    asIsMgmtManwon: number;
    asIsNetYieldPct: number;
    asIsGrossCapPct: number;
    asIsVacancyDesc?: string;
    stabilizedDepositManwon: number;
    stabilizedRentManwon: number;
    stabilizedMgmtManwon: number;
    stabilizedNetYieldPct: number;
    stabilizedGrossCapPct: number;
  };
}

export interface HoldOutCaseAuditResult {
  caseId: string;
  inputMode: string;
  oracleMathPassed: boolean;
  blindGuardPassed: boolean;
  rentRollTotalsPassed: boolean;
  occupancyPassed: boolean;
  leakedTokens: string[];
  discrepancies: string[];
  computedYields: {
    asIsNetYieldPct: number;
    asIsGrossCapPct: number;
    asIsNoiCap5Pct: number;
    stabilizedNetYieldPct: number;
    stabilizedGrossCapPct: number;
    stabilizedNoiCap5Pct: number;
  };
  dealcardScore5: number;
  imScore5: number;
}

export interface SealedHoldOutResult {
  status: 'evaluated' | 'skipped_missing_file';
  groundTruthPath: string;
  casesEvaluated: number;
  allOraclePassed: boolean;
  holdOutMean5: number | null;
  holdOutEffective100: number | null;
  caseResults: HoldOutCaseAuditResult[];
  observedTexts: string[];
}

function findFileByPrefixAndExt(
  dirPath: string,
  prefix: string,
  exts: readonly string[],
): string | null {
  if (!fs.existsSync(dirPath)) return null;
  const entries = fs.readdirSync(dirPath);
  for (const ext of exts) {
    const found = entries.find(
      (f) => f.startsWith(prefix) && f.toLowerCase().endsWith(ext.toLowerCase()),
    );
    if (found) return path.join(dirPath, found);
  }
  return null;
}

function parseHoldOutRentRollFile(filePath: string): {
  depositManwon: number;
  rentManwon: number;
  mgmtManwon: number;
  occupancy: ReturnType<typeof summarizeLeaseOccupancy>;
} {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
    const parsed = parseRentRollWorkbook(wb, { now: new Date('2026-11-20T00:00:00Z') });
    const leaseRows = parsed.parsedRows.map((r) => ({
      ...r,
      occupancy_resolved: resolveLeaseOccupancy(r),
    }));
    const leasedSum = sumLeasedRentRoll(leaseRows);
    const occupancy = summarizeLeaseOccupancy(leaseRows);
    return {
      depositManwon: round2(leasedSum.depositManwon || parsed.totalDeposit),
      rentManwon: round2(leasedSum.monthlyRentManwon || parsed.monthlyRent),
      mgmtManwon: round2(parsed.mgmtFeeTotal),
      occupancy,
    };
  }

  const rawTsv = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const parsed = parseTsvRentRoll(rawTsv);
  const leaseRows = parsed.rows.map((r) => ({
    floor: r.floor,
    unit: r.unit,
    tenant_name: r.tenantName || r.use,
    use: r.use,
    deposit_manwon: r.depositManwon,
    rent_manwon: r.monthlyRentManwon,
    mgmt_fee_manwon: r.maintenanceManwon,
    lease_end: r.normalizedExpiry || r.leaseExpiry,
    lease_state:
      r.status === 'vacant' ? '공실' : r.status === 'owner' ? '자가사용' : '임대중',
  }));
  const leasedSum = sumLeasedRentRoll(leaseRows);
  const occupancy = summarizeLeaseOccupancy(leaseRows);
  const mgmtManwon = round2(
    leaseRows
      .filter((r) => resolveLeaseOccupancy(r) === '임대중')
      .reduce((s, r) => s + (r.mgmt_fee_manwon || 0), 0),
  );
  return {
    depositManwon: round2(leasedSum.depositManwon),
    rentManwon: round2(leasedSum.monthlyRentManwon),
    mgmtManwon,
    occupancy,
  };
}

export async function evaluateSealedHoldOut(options: {
  groundTruthPath?: string;
  casesOverride?: readonly GroundTruthCaseEntry[];
} = {}): Promise<SealedHoldOutResult> {
  const { computeGrossYieldPct, computeNoiCapRatePct } = await getEnvBoundHelpers();
  const groundTruthPath = options.groundTruthPath ?? DEFAULT_GROUND_TRUTH_PATH;

  let cases: readonly GroundTruthCaseEntry[];
  let baseDir: string;

  if (options.casesOverride) {
    cases = options.casesOverride;
    baseDir = path.dirname(groundTruthPath);
  } else {
    if (!fs.existsSync(groundTruthPath)) {
      return {
        status: 'skipped_missing_file',
        groundTruthPath,
        casesEvaluated: 0,
        allOraclePassed: true,
        holdOutMean5: null,
        holdOutEffective100: null,
        caseResults: [],
        observedTexts: [],
      };
    }
    const raw = JSON.parse(fs.readFileSync(groundTruthPath, 'utf8').replace(/^\uFEFF/, '')) as {
      cases?: GroundTruthCaseEntry[];
    };
    cases = Array.isArray(raw.cases) ? raw.cases : [];
    baseDir = path.dirname(groundTruthPath);
  }

  const caseResults: HoldOutCaseAuditResult[] = [];
  const dcRuns: DealCardPpgtScoreResult[] = [];
  const imRuns: ImPpgtScoreResult[] = [];
  const observedTexts: string[] = [];

  for (const item of cases) {
    const discrepancies: string[] = [];
    const caseDir = item.folderName ? path.join(baseDir, item.folderName) : '';

    // 1) Blind Guard Verification (`enforceBlindGuard` against `checkedForbiddenTokens`)
    const memoFile = caseDir ? findFileByPrefixAndExt(caseDir, '01_', ['.txt']) : null;
    const rawMemoText = memoFile
      ? fs.readFileSync(memoFile, 'utf8').replace(/^\uFEFF/, '').trim()
      : `${item.jibunAddress} ${item.dealCardVerification.parsedUse} 매각 ${(item.askingPriceManwon / 10_000).toFixed(1)}억 ${item.dealCardVerification.checkedForbiddenTokens.join(' ')}`;

    const blindRes = enforceBlindGuard({
      rawMemoText,
      forbiddenTokens: item.dealCardVerification.checkedForbiddenTokens,
      address: item.jibunAddress,
      askingPriceManwon: item.askingPriceManwon,
      landAreaSqm: item.landAreaSqm,
      gfaSqm: item.gfaSqm,
      mainUsage: item.dealCardVerification.parsedUse,
    });
    observedTexts.push(blindRes.publicRenderedText);

    if (!blindRes.passed) {
      discrepancies.push(`blind_leak:${blindRes.leakedTokens.join(',')}`);
    }

    // 2) Oracle Yield Math Consistency (`computeGrossYieldPct` & `computeNoiCapRatePct`)
    const oracle = item.expectedOracle;
    const asIsNetYieldPct = computeGrossYieldPct(
      oracle.asIsRentManwon,
      item.askingPriceManwon,
      oracle.asIsDepositManwon,
    );
    const asIsGrossCapPct = computeNoiCapRatePct(
      oracle.asIsRentManwon,
      item.askingPriceManwon,
      0,
    );
    const asIsNoiCap5Pct = computeNoiCapRatePct(
      oracle.asIsRentManwon,
      item.askingPriceManwon,
      0.05,
    );

    const stabilizedNetYieldPct = computeGrossYieldPct(
      oracle.stabilizedRentManwon,
      item.askingPriceManwon,
      oracle.stabilizedDepositManwon,
    );
    const stabilizedGrossCapPct = computeNoiCapRatePct(
      oracle.stabilizedRentManwon,
      item.askingPriceManwon,
      0,
    );
    const stabilizedNoiCap5Pct = computeNoiCapRatePct(
      oracle.stabilizedRentManwon,
      item.askingPriceManwon,
      0.05,
    );

    let oracleMathPassed = true;
    if (Math.abs(asIsNetYieldPct - oracle.asIsNetYieldPct) > 0.02) {
      oracleMathPassed = false;
      discrepancies.push(
        `asIsNetYield mismatch: computed=${asIsNetYieldPct} vs expected=${oracle.asIsNetYieldPct}`,
      );
    }
    if (Math.abs(asIsGrossCapPct - oracle.asIsGrossCapPct) > 0.02) {
      oracleMathPassed = false;
      discrepancies.push(
        `asIsGrossCap mismatch: computed=${asIsGrossCapPct} vs expected=${oracle.asIsGrossCapPct}`,
      );
    }
    if (!(asIsNoiCap5Pct > 0 && asIsNoiCap5Pct <= asIsGrossCapPct)) {
      oracleMathPassed = false;
      discrepancies.push(`asIsNoiCap5Pct invalid: ${asIsNoiCap5Pct}`);
    }
    if (Math.abs(stabilizedNetYieldPct - oracle.stabilizedNetYieldPct) > 0.02) {
      oracleMathPassed = false;
      discrepancies.push(
        `stabilizedNetYield mismatch: computed=${stabilizedNetYieldPct} vs expected=${oracle.stabilizedNetYieldPct}`,
      );
    }
    if (Math.abs(stabilizedGrossCapPct - oracle.stabilizedGrossCapPct) > 0.02) {
      oracleMathPassed = false;
      discrepancies.push(
        `stabilizedGrossCap mismatch: computed=${stabilizedGrossCapPct} vs expected=${oracle.stabilizedGrossCapPct}`,
      );
    }

    // 3) Totals & Occupancy Verification (`asIsTotalsManwon`, `stabilizedTotalsManwon`, `lease-vacancy`)
    const rrVer = item.rentRollVerification;
    let rentRollTotalsPassed =
      rrVer.asIsTotalsManwon.deposit === oracle.asIsDepositManwon &&
      rrVer.asIsTotalsManwon.rent === oracle.asIsRentManwon &&
      rrVer.asIsTotalsManwon.mgmt === oracle.asIsMgmtManwon &&
      rrVer.stabilizedTotalsManwon.deposit === oracle.stabilizedDepositManwon &&
      rrVer.stabilizedTotalsManwon.rent === oracle.stabilizedRentManwon &&
      rrVer.stabilizedTotalsManwon.mgmt === oracle.stabilizedMgmtManwon;

    if (!rentRollTotalsPassed) {
      discrepancies.push('oracle_vs_rentRollVerification_totals_mismatch');
    }

    let occupancyPassed = true;
    const asIsFile = caseDir ? findFileByPrefixAndExt(caseDir, '02_', ['.xlsx', '.tsv']) : null;
    const stabFile = caseDir ? findFileByPrefixAndExt(caseDir, '03_', ['.xlsx', '.tsv']) : null;

    if (asIsFile) {
      const parsedAsIs = parseHoldOutRentRollFile(asIsFile);
      if (
        Math.abs(parsedAsIs.depositManwon - rrVer.asIsTotalsManwon.deposit) > 0.5 ||
        Math.abs(parsedAsIs.rentManwon - rrVer.asIsTotalsManwon.rent) > 0.5 ||
        Math.abs(parsedAsIs.mgmtManwon - rrVer.asIsTotalsManwon.mgmt) > 0.5
      ) {
        rentRollTotalsPassed = false;
        discrepancies.push(
          `asIs_file_totals_mismatch: got(${parsedAsIs.depositManwon}/${parsedAsIs.rentManwon}/${parsedAsIs.mgmtManwon}) vs expected(${rrVer.asIsTotalsManwon.deposit}/${rrVer.asIsTotalsManwon.rent}/${rrVer.asIsTotalsManwon.mgmt})`,
        );
      }
      if (rrVer.occupancySummaryAsIs) {
        const expOcc = rrVer.occupancySummaryAsIs;
        const gotOcc = parsedAsIs.occupancy;
        if (
          gotOcc.total !== expOcc.total ||
          gotOcc.leased !== expOcc.leased ||
          gotOcc.vacant !== expOcc.vacant ||
          gotOcc.ownerUse !== expOcc.ownerUse ||
          gotOcc.nonLeasable !== expOcc.nonLeasable ||
          gotOcc.vacancyPct !== expOcc.vacancyPct
        ) {
          occupancyPassed = false;
          discrepancies.push(
            `occupancy_mismatch: got(${JSON.stringify(gotOcc)}) vs expected(${JSON.stringify(expOcc)})`,
          );
        }
      }
    }

    if (stabFile) {
      const parsedStab = parseHoldOutRentRollFile(stabFile);
      if (
        Math.abs(parsedStab.depositManwon - rrVer.stabilizedTotalsManwon.deposit) > 0.5 ||
        Math.abs(parsedStab.rentManwon - rrVer.stabilizedTotalsManwon.rent) > 0.5 ||
        Math.abs(parsedStab.mgmtManwon - rrVer.stabilizedTotalsManwon.mgmt) > 0.5
      ) {
        rentRollTotalsPassed = false;
        discrepancies.push(
          `stabilized_file_totals_mismatch: got(${parsedStab.depositManwon}/${parsedStab.rentManwon}/${parsedStab.mgmtManwon}) vs expected(${rrVer.stabilizedTotalsManwon.deposit}/${rrVer.stabilizedTotalsManwon.rent}/${rrVer.stabilizedTotalsManwon.mgmt})`,
        );
      }
    }

    const dcRun = scoreDealCardPpgtRun({
      personaId: 'DC-MG-02',
      surface: `holdout:${item.id}:dealcard`,
      viewport: '390x844',
      fontScale: 'xlarge',
      aboveFoldActionCount: 8,
      totalVisibleInteractiveCount: 14,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: 0,
      bannedTermCount: 0,
      blindLeakCount: blindRes.leakedTokens.length,
      taskCompleted: blindRes.passed,
      blockingModalDetected: false,
      boundaryViolationCount: blindRes.passed ? 0 : 1,
      provenanceBadgeVisible: true,
      artifactValid: blindRes.passed,
      honestSaveVisible: true,
    });

    const imAllOk = oracleMathPassed && rentRollTotalsPassed && occupancyPassed;
    const imRun = scoreImPpgtRun({
      personaId: 'IM-MG-05',
      surface: `holdout:${item.id}:im`,
      viewport: '1440x900',
      fontScale: 'normal',
      aboveFoldActionCount: 8,
      totalVisibleInteractiveCount: 14,
      horizontalOverflowPx: 0,
      sub44ButtonsCount: 0,
      sub15TextsCount: 0,
      clippedButtonsCount: 0,
      brokenImgCount: 0,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      poisonTokenCount: imAllOk ? 0 : 1,
      bannedTermCount: 0,
      taskCompleted: imAllOk,
      blockingModalDetected: false,
      boundaryViolationCount: imAllOk ? 0 : 1,
      provenanceBadgeVisible: true,
      artifactValid: imAllOk,
      honestSaveVisible: true,
    });

    dcRuns.push(dcRun);
    imRuns.push(imRun);

    caseResults.push({
      caseId: item.id,
      inputMode: item.inputMode,
      oracleMathPassed,
      blindGuardPassed: blindRes.passed,
      rentRollTotalsPassed,
      occupancyPassed,
      leakedTokens: blindRes.leakedTokens,
      discrepancies,
      computedYields: {
        asIsNetYieldPct,
        asIsGrossCapPct,
        asIsNoiCap5Pct,
        stabilizedNetYieldPct,
        stabilizedGrossCapPct,
        stabilizedNoiCap5Pct,
      },
      dealcardScore5: dcRun.weightedOverall,
      imScore5: imRun.weightedOverall,
    });
  }

  const allScores5 = [...dcRuns.map((r) => r.weightedOverall), ...imRuns.map((r) => r.weightedOverall)];
  const holdOutMean5 =
    allScores5.length > 0
      ? round2(allScores5.reduce((a, b) => a + b, 0) / allScores5.length)
      : null;

  const anyHoldOutFloor = dcRuns.some((r) => r.floorRisk) || imRuns.some((r) => r.floorRisk);
  const rawHoldOut100 = holdOutMean5 !== null ? round2(25 * (holdOutMean5 - 1.0)) : null;
  const holdOutEffective100 =
    rawHoldOut100 !== null
      ? anyHoldOutFloor
        ? round2(Math.min(rawHoldOut100, FLOOR_CAP_100))
        : rawHoldOut100
      : null;

  const allOraclePassed = caseResults.every(
    (c) =>
      c.oracleMathPassed &&
      c.blindGuardPassed &&
      c.rentRollTotalsPassed &&
      c.occupancyPassed,
  );

  return {
    status: 'evaluated',
    groundTruthPath,
    casesEvaluated: caseResults.length,
    allOraclePassed,
    holdOutMean5,
    holdOutEffective100,
    caseResults,
    observedTexts,
  };
}

// ============================================================================
// GENERALIZATION GAP (`|tuningMean5 - holdOutMean5|`)
// ============================================================================

export interface GeneralizationGapSummary {
  tuningMean5: number;
  holdOutMean5: number | null;
  generalizationGap5: number | null;
  threshold5: number;
  overfittingWarning: boolean;
}

export function computeGeneralizationGap(
  tuningMean5: number,
  holdOutMean5: number | null,
): GeneralizationGapSummary {
  const t5 = round2(tuningMean5);
  if (holdOutMean5 === null || !Number.isFinite(holdOutMean5)) {
    return {
      tuningMean5: t5,
      holdOutMean5: null,
      generalizationGap5: null,
      threshold5: OVERFITTING_GAP_THRESHOLD_5,
      overfittingWarning: false,
    };
  }
  const h5 = round2(holdOutMean5);
  const gap5 = round2(Math.abs(t5 - h5));
  return {
    tuningMean5: t5,
    holdOutMean5: h5,
    generalizationGap5: gap5,
    threshold5: OVERFITTING_GAP_THRESHOLD_5,
    overfittingWarning: gap5 > OVERFITTING_GAP_THRESHOLD_5,
  };
}

// ============================================================================
// STEP C: OPT-IN CROSS-MODEL SPAN-GROUNDED R3 JUDGE (`--with-llm-judge`)
// ============================================================================

export function assertValidLiveOpenAiKey(rawKey: string | undefined = process.env.OPENAI_API_KEY): string {
  const trimmed = (rawKey ?? '').trim();
  if (
    !trimmed ||
    /^mock/i.test(trimmed) ||
    trimmed === 'test-openai-key' ||
    trimmed === 'not-configured' ||
    trimmed === 'offline-dummy-key' ||
    /^dummy/i.test(trimmed)
  ) {
    throw new Error(
      '[Ring 2 R3 Fail-Loud] Valid live OPENAI_API_KEY is required when --with-llm-judge is passed (missing or mock/placeholder key rejected).',
    );
  }
  return trimmed;
}

export interface CrossModelR3CandidateInput {
  r2Score5: number;
  r2FloorRisk: boolean;
  r3Score5: number;
  r3FloorRisk: boolean;
  reactionSummary: string;
  quotedSpans: readonly string[];
  observedText: string | readonly string[];
}

export interface CrossModelR3BlendResult {
  reactionSummary: string;
  groundedSpans: string[];
  hallucinatedSpans: string[];
  groundedRatio: number;
  divergence5: number;
  blendAccepted: boolean;
  rejectionReason: string | null;
  floorRisk: boolean;
  blendedScore5: number;
  blendedScore100: number;
}

/**
 * Validates `[SIMULATED] ` prefix, span-grounding (`groundedRatio >= 0.5`), and
 * R3-vs-R2 calibration (`|R3 - R2| < 2.0`) before blending `0.70 * R2 + 0.30 * R3`,
 * capping at `FLOOR_CAP_5 = 2.85` (`FLOOR_CAP_100 = 46.25`) if `floorRisk` is true.
 */
export function validateAndBlendR3Score(
  input: CrossModelR3CandidateInput,
): CrossModelR3BlendResult {
  const reactionSummary = formatSimulatedReaction(input.reactionSummary || '');
  if (!reactionSummary.startsWith('[SIMULATED] ')) {
    throw new Error('INV-P06 violation: reactionSummary must start with "[SIMULATED] "');
  }

  const groundedSpans: string[] = [];
  const hallucinatedSpans: string[] = [];
  for (const sp of input.quotedSpans) {
    if (isSpanGrounded(sp, input.observedText)) {
      groundedSpans.push(sp);
    } else {
      hallucinatedSpans.push(sp);
    }
  }

  const groundedRatio =
    input.quotedSpans.length > 0
      ? round2(groundedSpans.length / input.quotedSpans.length)
      : 0;
  const clampedR3 = Math.min(5.0, Math.max(1.0, input.r3Score5));
  const clampedR2 = Math.min(5.0, Math.max(1.0, input.r2Score5));
  const divergence5 = round2(Math.abs(clampedR3 - clampedR2));

  let rejectionReason: string | null = null;
  if (groundedRatio < 0.5) {
    rejectionReason = `groundedRatio ${groundedRatio} < 0.5`;
  } else if (divergence5 >= 2.0) {
    rejectionReason = `|R3 - R2| divergence ${divergence5} >= 2.0`;
  }

  const blendAccepted = rejectionReason === null;
  const rawScore5 = blendAccepted
    ? round2(0.7 * clampedR2 + 0.3 * clampedR3)
    : clampedR2;
  const floorRisk = Boolean(input.r2FloorRisk || input.r3FloorRisk);
  const blendedScore5 = floorRisk ? round2(Math.min(rawScore5, FLOOR_CAP_5)) : rawScore5;
  const rawScore100 = round2(25 * (blendedScore5 - 1.0));
  const blendedScore100 = floorRisk
    ? round2(Math.min(rawScore100, FLOOR_CAP_100))
    : rawScore100;

  return {
    reactionSummary,
    groundedSpans,
    hallucinatedSpans,
    groundedRatio,
    divergence5,
    blendAccepted,
    rejectionReason,
    floorRisk,
    blendedScore5,
    blendedScore100,
  };
}

export type LiveChatTransport = (
  params: LLMChatParams,
) => Promise<LLMChatResult & { promptTokens?: number; completionTokens?: number }>;

interface RawLlmR3Payload {
  negativeControl?: {
    overallScore?: number;
    floorRisk?: boolean;
  };
  subsystems?: Record<
    string,
    {
      overallScore?: number;
      floorRisk?: boolean;
      reactionSummary?: string;
      quotedSpans?: string[];
    }
  >;
}

export async function executeLiveCrossModelR3Audit(params: {
  tuning: TuningEvaluationResult;
  observedCorpus: readonly string[];
  apiKey?: string;
  modelOverride?: string;
  chatTransport?: LiveChatTransport;
}): Promise<{
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  subsystemBlends: Record<CreSubsystemId, CrossModelR3BlendResult>;
  r3Inputs: {
    im: LayerDR3SubsystemInput;
    newsletter: LayerDR3SubsystemInput;
    dealcard: LayerDR3SubsystemInput;
    inbox: LayerDR3SubsystemInput;
  };
}> {
  const validKey = assertValidLiveOpenAiKey(params.apiKey);
  const model = params.modelOverride || process.env.AI_MODEL_SOL || getModel('sol') || 'gpt-5.6-sol';

  const transport: LiveChatTransport =
    params.chatTransport ??
    (async (chatParams) => {
      // Instantiate OpenAIProvider directly with explicit validKey — NEVER falls back to MockOpenAIProvider!
      ensurePublicEnvFallbacksForOfflineCli();
      const { OpenAIProvider } = await import('../../src/ai/providers/openai');
      const prevKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = validKey;
      try {
        const provider = new OpenAIProvider();
        return await provider.chat(chatParams);
      } finally {
        if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = prevKey;
      }
    });

  const pickTagSamples = (prefix: string, count: number, maxLen: number) =>
    params.observedCorpus
      .filter((s) => s.startsWith(prefix))
      .slice(0, count)
      .map((s) => s.slice(0, maxLen));

  const stratifiedSamples = [
    ...pickTagSamples('[IM:', 2, 850),
    ...pickTagSamples('[NEWSLETTER:', 2, 850),
    ...pickTagSamples('[DEALCARD:', 3, 650),
    ...pickTagSamples('[INBOX:', 2, 700),
  ];

  const corpusExcerpt = (
    stratifiedSamples.length > 0
      ? stratifiedSamples
      : params.observedCorpus.slice(0, 12).map((s) => s.slice(0, 600))
  ).join('\n---\n');

  const systemPrompt = [
    'You are an anti-sycophancy South Korean Commercial Real Estate (CRE) QA cross-model judge (PPGT-Loop R3).',
    'Rules:',
    '1. First score the deliberately broken negativeControl excerpt: it MUST receive overallScore <= 2.85 and floorRisk = true.',
    '2. Score each subsystem (im, newsletter, dealcard, inbox) on 1.0–5.0 strictly without inflation.',
    '3. Every reactionSummary MUST start with "[SIMULATED] ".',
    '4. Every quotedSpans entry MUST be an exact verbatim substring (>= 4 chars) copied from Observed Corpus.',
    '5. Output strict JSON only.',
  ].join('\n');

  const userPrompt = [
    'Negative Control Excerpt (must fail):',
    '"서초동 1364-28 FM빌딩 최상무 010-3344-8899 | 건폐율 0% / 0% | 기대수익률 NaN%"',
    '',
    'Observed Corpus (quote verbatim in quotedSpans):',
    corpusExcerpt,
    '',
    'Return JSON schema:',
    JSON.stringify({
      negativeControl: { overallScore: 1.8, floorRisk: true },
      subsystems: {
        im: { overallScore: 4.7, floorRisk: false, reactionSummary: '[SIMULATED] ...', quotedSpans: ['...'] },
        newsletter: { overallScore: 4.7, floorRisk: false, reactionSummary: '[SIMULATED] ...', quotedSpans: ['...'] },
        dealcard: { overallScore: 4.7, floorRisk: false, reactionSummary: '[SIMULATED] ...', quotedSpans: ['...'] },
        inbox: { overallScore: 4.7, floorRisk: false, reactionSummary: '[SIMULATED] ...', quotedSpans: ['...'] },
      },
    }),
  ].join('\n');

  let response: LLMChatResult & { promptTokens?: number; completionTokens?: number };
  try {
    response = await transport({
      model,
      systemPrompt,
      userPrompt,
      maxTokens: 4096,
      temperature: 0.1,
      responseFormat: 'json_object',
    });
  } catch (err: unknown) {
    const status = (err as { status?: number; statusCode?: number })?.status ??
      (err as { statusCode?: number })?.statusCode;
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[Ring 2 R3 Fail-Loud] Live OpenAI cross-model judge failed${status ? ` (HTTP ${status})` : ''}: ${msg}`,
    );
  }

  const rawContent = (response?.content ?? '').trim();
  if (!rawContent) {
    throw new Error('[Ring 2 R3 Fail-Loud] OpenAI returned empty content in --with-llm-judge mode.');
  }

  let parsed: RawLlmR3Payload;
  try {
    parsed = JSON.parse(rawContent) as RawLlmR3Payload;
  } catch (err: unknown) {
    throw new Error(
      `[Ring 2 R3 Fail-Loud] OpenAI returned non-JSON content in --with-llm-judge mode: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const ncScore = Number(parsed.negativeControl?.overallScore ?? 5.0);
  const ncFloor = Boolean(parsed.negativeControl?.floorRisk);
  const ncPassed = ncScore <= 2.9 && ncFloor === true;
  if (!ncPassed) {
    throw new Error(
      `[Ring 2 R3 Fail-Loud] Live R3 negative control failed anti-sycophancy check (score=${ncScore}, floorRisk=${ncFloor}).`,
    );
  }

  const { calculateCost } = await getEnvBoundHelpers();
  const promptTokens = Number(response.promptTokens ?? 0);
  const completionTokens = Number(response.completionTokens ?? 0);
  const estimatedCostUsd = round2(calculateCost(model, promptTokens, completionTokens) * 100) / 100;
  const exactCostUsd =
    Math.round(calculateCost(model, promptTokens, completionTokens) * 10_000) / 10_000;

  const subIds: CreSubsystemId[] = ['im', 'newsletter', 'dealcard', 'inbox'];
  const subsystemBlends = {} as Record<CreSubsystemId, CrossModelR3BlendResult>;

  const r2MeanBySub: Record<CreSubsystemId, { score5: number; floorRisk: boolean }> = {
    im: {
      score5: round2(
        params.tuning.imRuns.reduce((s, r) => s + r.weightedOverall, 0) /
          Math.max(1, params.tuning.imRuns.length),
      ),
      floorRisk: params.tuning.imRuns.some((r) => r.floorRisk),
    },
    newsletter: {
      score5: round2(
        params.tuning.newsletterRuns.reduce((s, r) => s + r.weightedOverall, 0) /
          Math.max(1, params.tuning.newsletterRuns.length),
      ),
      floorRisk: params.tuning.newsletterRuns.some((r) => r.floorRisk),
    },
    dealcard: {
      score5: round2(
        params.tuning.dealcardRuns.reduce((s, r) => s + r.weightedOverall, 0) /
          Math.max(1, params.tuning.dealcardRuns.length),
      ),
      floorRisk: params.tuning.dealcardRuns.some((r) => r.floorRisk),
    },
    inbox: {
      score5: round2(
        params.tuning.inboxRuns.reduce((s, r) => s + r.weightedOverall, 0) /
          Math.max(1, params.tuning.inboxRuns.length),
      ),
      floorRisk: params.tuning.inboxRuns.some((r) => r.floorRisk),
    },
  };

  for (const sub of subIds) {
    const subRaw = parsed.subsystems?.[sub];
    if (!subRaw || typeof subRaw.overallScore !== 'number') {
      throw new Error(`[Ring 2 R3 Fail-Loud] Missing R3 score for subsystem '${sub}'.`);
    }
    subsystemBlends[sub] = validateAndBlendR3Score({
      r2Score5: r2MeanBySub[sub].score5,
      r2FloorRisk: r2MeanBySub[sub].floorRisk,
      r3Score5: subRaw.overallScore,
      r3FloorRisk: Boolean(subRaw.floorRisk),
      reactionSummary: subRaw.reactionSummary || `[SIMULATED] ${sub} R3 evaluation`,
      quotedSpans: Array.isArray(subRaw.quotedSpans) ? subRaw.quotedSpans : [],
      observedText: params.observedCorpus,
    });
  }

  const buildLayerDInput = (sub: CreSubsystemId): LayerDR3SubsystemInput => {
    const b = subsystemBlends[sub];
    const r3RawScore5 = Number(parsed.subsystems?.[sub]?.overallScore ?? b.blendedScore5);
    const effectiveScore5ForBlend = b.blendAccepted ? r3RawScore5 : r2MeanBySub[sub].score5;
    return {
      model,
      calls: 1,
      promptTokens: Math.round(promptTokens / 4),
      completionTokens: Math.round(completionTokens / 4),
      estimatedCostUsd: Math.round((exactCostUsd / 4) * 10_000) / 10_000,
      negativeControlsPassed: ncPassed,
      groundedRatio: b.groundedRatio,
      uiPersonaR3Mean5: effectiveScore5ForBlend,
      deliverableR3Score5: effectiveScore5ForBlend,
      r3FloorRisk: b.floorRisk,
    };
  };

  void estimatedCostUsd;
  return {
    model,
    calls: 1,
    promptTokens,
    completionTokens,
    estimatedCostUsd: exactCostUsd,
    subsystemBlends,
    r3Inputs: {
      im: buildLayerDInput('im'),
      newsletter: buildLayerDInput('newsletter'),
      dealcard: buildLayerDInput('dealcard'),
      inbox: buildLayerDInput('inbox'),
    },
  };
}

// ============================================================================
// STEP D: FULL ORCHESTRATOR & ARTIFACT OUTPUT
// ============================================================================

export interface Ring2AiJudgeReport {
  generatedAt: string;
  mode: 'deterministic_r1_r2' | 'live_cross_model_r3';
  llmCalls: number;
  estimatedCostUsd: number;
  antiSycophancyGate: AntiSycophancyGateResult;
  promptHashStatus: {
    aggregateSha256: string;
    diff: PromptManifestDiff;
  };
  tuning: {
    mean5: number;
    effectiveScore100: number;
    rawMean100: number;
    floorRiskCount: number;
  };
  holdOut: SealedHoldOutResult;
  generalization: GeneralizationGapSummary;
  topBacklog: UnifiedBacklogItem[];
  unifiedScorecard: UnifiedCreReport100;
  r3SubsystemBlends?: Record<CreSubsystemId, CrossModelR3BlendResult>;
}

export function formatRing2JudgeMarkdown(report: Ring2AiJudgeReport): string {
  const holdOutLine =
    report.holdOut.status === 'evaluated'
      ? `**${report.holdOut.holdOutMean5?.toFixed(2)} / 5.00** (${report.holdOut.holdOutEffective100?.toFixed(2)} / 100점, ${report.holdOut.casesEvaluated}개 케이스, Oracle=${report.holdOut.allOraclePassed ? 'PASS' : 'FAIL'})`
      : `SKIPPED (미추적 파일 미존재: \`${path.basename(report.holdOut.groundTruthPath)}\`)`;

  const gapLine =
    report.generalization.generalizationGap5 !== null
      ? `**${report.generalization.generalizationGap5.toFixed(2)}** (임계값 <= ${report.generalization.threshold5.toFixed(2)}, 과적합 경고: **${report.generalization.overfittingWarning ? 'WARNING' : 'NONE'}**)`
      : 'N/A (Hold-Out 미실행)';

  const promptStatus = report.promptHashStatus.diff.matches
    ? `MATCH (\`${report.promptHashStatus.aggregateSha256.slice(0, 12)}\`, ${report.promptHashStatus.diff.totalTracked} files)`
    : `CHANGED (changed=${report.promptHashStatus.diff.changed.length}, added=${report.promptHashStatus.diff.added.length}, removed=${report.promptHashStatus.diff.removed.length})`;

  const holdOutTable =
    report.holdOut.status === 'evaluated'
      ? [
          '',
          '## 0-B. Sealed Hold-Out (`ground_truth_5cases.json`) 검증 상세',
          '| 케이스 | 입력 모드 | 수익률 오라클 | 블라인드 가드 | 렌트롤 합계 | 점유율 SSOT | DealCard(5) | IM(5) | 결함 |',
          '|:--|:--|:--:|:--:|:--:|:--:|--:|--:|:--|',
          ...report.holdOut.caseResults.map(
            (c) =>
              `| **${c.caseId}** | \`${c.inputMode}\` | ${c.oracleMathPassed ? 'PASS' : 'FAIL'} | ${c.blindGuardPassed ? 'PASS' : 'FAIL'} | ${c.rentRollTotalsPassed ? 'PASS' : 'FAIL'} | ${c.occupancyPassed ? 'PASS' : 'FAIL'} | ${c.dealcardScore5.toFixed(2)} | ${c.imScore5.toFixed(2)} | ${c.discrepancies.length === 0 ? '-' : c.discrepancies.join('; ')} |`,
          ),
        ]
      : [];

  return [
    '# Ring 2 AI Golden Judge & Sealed Hold-Out Report',
    '',
    `- 실행 모드: \`${report.mode}\` (LLM 호출: \`${report.llmCalls}\`회 · 비용: \`$${report.estimatedCostUsd.toFixed(4)}\`)`,
    `- Anti-Sycophancy Gate (4대 서브시스템): **${report.antiSycophancyGate.passed ? 'PASS' : 'FAIL'}**`,
    `- Tuning Set 평균: **${report.tuning.mean5.toFixed(2)} / 5.00** (**${report.tuning.effectiveScore100.toFixed(2)} / 100점**)`,
    `- Sealed Hold-Out 평균: ${holdOutLine}`,
    `- Generalization Gap (\`|Tuning - HoldOut|\`): ${gapLine}`,
    `- Prompt/Schema Hash Guard: ${promptStatus}`,
    ...holdOutTable,
    '',
    formatUnifiedCreScorecardMarkdown(report.unifiedScorecard),
  ].join('\n');
}

export interface RunRing2JudgeOptions {
  withLlmJudge?: boolean;
  groundTruthPath?: string;
  outDir?: string;
  writeArtifacts?: boolean;
  rootDir?: string;
  manifestPath?: string;
  apiKey?: string;
  chatTransport?: LiveChatTransport;
  quiet?: boolean;
}

export async function runRing2AiJudge(
  options: RunRing2JudgeOptions = {},
): Promise<Ring2AiJudgeReport> {
  const withLlmJudge = Boolean(options.withLlmJudge);
  const outDir = options.outDir ?? DEFAULT_OUT_DIR;
  const writeArtifacts = options.writeArtifacts ?? true;
  const quiet = Boolean(options.quiet);

  // Step A: Anti-Sycophancy Gate
  const antiSycophancyGate = runAntiSycophancyGate();
  if (!antiSycophancyGate.passed) {
    throw new Error(
      `[Ring 2 Anti-Sycophancy Gate FAILED] ${antiSycophancyGate.failures.join('; ')}`,
    );
  }

  // Fail-Loud key check upfront when --with-llm-judge is requested
  if (withLlmJudge) {
    assertValidLiveOpenAiKey(options.apiKey);
  }

  // Prompt Hash Guard check
  const currentHashes = computeCurrentPromptHashes(options.rootDir ?? DEFAULT_ROOT_DIR);
  const loadedManifest = loadPromptManifest(options.manifestPath ?? DEFAULT_MANIFEST_PATH);
  const promptDiff = diffPromptManifest(currentHashes, loadedManifest);

  // Step B: Tuning vs Sealed Hold-Out ($0 deterministic R1+R2)
  const tuning = await evaluateTuningSet();
  const holdOut = await evaluateSealedHoldOut({ groundTruthPath: options.groundTruthPath });
  const generalization = computeGeneralizationGap(tuning.tuningMean5, holdOut.holdOutMean5);

  let unifiedScorecard = tuning.unifiedReport;
  let llmCalls = 0;
  let estimatedCostUsd = 0;
  let r3SubsystemBlends: Record<CreSubsystemId, CrossModelR3BlendResult> | undefined;

  // Step C: Opt-in Cross-Model R3 Judge
  if (!withLlmJudge) {
    if (!quiet) {
      console.log(
        '[Ring 2] Mode: deterministic R1+R2 ($0.00, 0 LLM calls). Pass --with-llm-judge to run live cross-model R3 audit.',
      );
    }
  } else {
    const fullCorpus = [...tuning.observedCorpus, ...holdOut.observedTexts];
    const r3Out = await executeLiveCrossModelR3Audit({
      tuning,
      observedCorpus: fullCorpus,
      apiKey: options.apiKey,
      chatTransport: options.chatTransport,
    });
    llmCalls = r3Out.calls;
    estimatedCostUsd = r3Out.estimatedCostUsd;
    r3SubsystemBlends = r3Out.subsystemBlends;

    unifiedScorecard = buildUnifiedCreReport100({
      imRuns: tuning.imRuns,
      newsletterRuns: tuning.newsletterRuns,
      dealcardRuns: tuning.dealcardRuns,
      inboxRuns: tuning.inboxRuns,
      imBacklog: rankImPpgtBacklog(tuning.imRuns),
      newsletterBacklog: rankNewsletterPpgtBacklog(tuning.newsletterRuns),
      dealcardBacklog: rankDealCardPpgtBacklog(tuning.dealcardRuns),
      inboxBacklog: rankInboxPpgtBacklog(tuning.inboxRuns),
      r3Inputs: r3Out.r3Inputs,
    });
  }

  const report: Ring2AiJudgeReport = {
    generatedAt: new Date().toISOString(),
    mode: withLlmJudge ? 'live_cross_model_r3' : 'deterministic_r1_r2',
    llmCalls,
    estimatedCostUsd,
    antiSycophancyGate,
    promptHashStatus: {
      aggregateSha256: currentHashes.aggregateSha256,
      diff: promptDiff,
    },
    tuning: {
      mean5: tuning.tuningMean5,
      effectiveScore100: unifiedScorecard.overallEffectiveMean100,
      rawMean100: unifiedScorecard.overallRawMean100,
      floorRiskCount: unifiedScorecard.totalFloorRiskCount,
    },
    holdOut,
    generalization,
    topBacklog: unifiedScorecard.topBacklog,
    unifiedScorecard,
    ...(r3SubsystemBlends ? { r3SubsystemBlends } : {}),
  };

  // Step D: Write Scorecard & P-Score Backlog Artifacts
  if (writeArtifacts) {
    fs.mkdirSync(outDir, { recursive: true });
    const jsonPath = path.join(outDir, 'ai-golden-judge-report.json');
    const mdPath = path.join(outDir, 'ai-golden-judge-report.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(mdPath, `${formatRing2JudgeMarkdown(report)}\n`, 'utf8');
    if (!quiet) {
      console.log(
        `[Ring 2] Tuning=${report.tuning.mean5.toFixed(2)}/5 (${report.tuning.effectiveScore100.toFixed(2)}/100) | HoldOut=${report.holdOut.holdOutMean5 !== null ? `${report.holdOut.holdOutMean5.toFixed(2)}/5 (${report.holdOut.casesEvaluated} cases)` : 'SKIPPED'} | Gap=${report.generalization.generalizationGap5 !== null ? report.generalization.generalizationGap5.toFixed(2) : 'N/A'} (overfit=${report.generalization.overfittingWarning}) | Report -> ${jsonPath}`,
      );
    }
  }

  return report;
}

function isDirectCliExecution(): boolean {
  if (process.env.VITEST === 'true') return false;
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return (
      path.resolve(entry).toLowerCase() ===
      path.resolve(fileURLToPath(import.meta.url)).toLowerCase()
    );
  } catch {
    return false;
  }
}

export async function runRing2Cli(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const withLlmJudge = argv.includes('--with-llm-judge');
  if (withLlmJudge) {
    const envLocalPath = path.join(ROOT_DIR, '.env.local');
    if (fs.existsSync(envLocalPath)) {
      const dotenv = await import('dotenv');
      dotenv.config({ path: envLocalPath });
    }
  }
  try {
    const report = await runRing2AiJudge({ withLlmJudge });
    if (report.holdOut.status === 'evaluated' && !report.holdOut.allOraclePassed) {
      console.error('❌ [Ring 2] Sealed Hold-Out oracle verification failed.');
      return 1;
    }
    if (report.unifiedScorecard.totalFloorRiskCount > 0) {
      console.error(
        `❌ [Ring 2] Floor risk triggered (${report.unifiedScorecard.totalFloorRiskCount} runs).`,
      );
      return 1;
    }
    return 0;
  } catch (err: unknown) {
    console.error(
      `❌ [Ring 2] Execution halted: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }
}

if (isDirectCliExecution()) {
  runRing2Cli().then((code) => {
    process.exitCode = code;
  });
}
