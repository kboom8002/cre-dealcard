/**
 * @file src/lib/qa/unified-cre-rubric.ts
 * @description CRE DealCard 3대 서브시스템(IM · 부동산뉴스 · 딜카드) 통합 100점 비보상 루브릭(CRE-PPGT-100).
 *
 * 4대 점검 축 배점 (총 100점):
 *  - ① 콘텐츠 적합성 (Content Suitability): 30점  [0.55 * C3 + 0.45 * C1]
 *  - ② UX 라이팅 (UX Writing):             20점  [0.45 * U1 + 0.55 * C2]
 *  - ③ UX 무마찰 (Zero-Friction UX):       25점  [0.65 * U2 + 0.35 * U1]
 *  - ④ 기능·산출물 완전성 (Completeness):   25점  [0.60 * U3 + 0.40 * C2]
 *
 * 비보상(Non-Compensatory) 과락 원칙:
 *  - 개별 실행(Run)에서 `floorRisk === true` 발생 시 해당 실행 점수는 최대 46.25점(<= 2.85/5.0)으로 즉시 캡핑
 *  - 서브시스템 내 단 1건이라도 `floorRisk === true`가 존재하면 서브시스템 유효 점수(`effectiveScore100`) 역시
 *    최대 46.25점으로 캡핑하여 단순 산술평균 착시(Compensatory Trap)를 원천 차단
 *  - 인간 2nd 검수 진입 조건: 3대 서브시스템 모두 `effectiveScore100 >= 90.0` AND `floorRiskCount === 0`
 */

import type { ImPpgtScoreResult, ImPpgtBacklogCluster } from './im-ppgt-personas';
import type {
  NewsletterPpgtScoreResult,
  NewsletterPpgtBacklogCluster,
} from './newsletter-ppgt-personas';
import type {
  DealCardPpgtScoreResult,
  DealCardPpgtBacklogCluster,
} from './dealcard-ppgt-personas';
import type {
  InboxPpgtScoreResult,
  InboxPpgtBacklogCluster,
} from './inbox-ppgt-personas';

export type CreSubsystemId = 'im' | 'newsletter' | 'dealcard' | 'inbox';

export interface FourPillarBreakdown100 {
  /** ① 콘텐츠 적합성 (0 ~ 30) */
  contentSuitability30: number;
  /** ② UX 라이팅 (0 ~ 20) */
  uxWriting20: number;
  /** ③ UX 무마찰 (0 ~ 25) */
  zeroFrictionUx25: number;
  /** ④ 기능 및 산출물 완전성 (0 ~ 25) */
  functionalCompleteness25: number;
}

export interface UnifiedRunScore100 {
  subsystem: CreSubsystemId;
  personaId: string;
  surface: string;
  r2Weighted5: number;
  pillars: FourPillarBreakdown100;
  pillarSum100: number;
  ppgtLinear100: number;
  effectiveScore100: number;
  floorRisk: boolean;
  floorReasons: string[];
  syntheticSummary: string;
}

export interface SubsystemScorecard100 {
  subsystem: CreSubsystemId;
  labelKo: string;
  runCount: number;
  pillarsMean: FourPillarBreakdown100;
  rawMeanScore100: number;
  /** 과락 1건이라도 존재 시 <= 46.25로 강제 캡핑된 최종 유효 점수 */
  effectiveScore100: number;
  minRunScore100: number;
  floorRiskCount: number;
  floorReasons: string[];
  meetsTarget90: boolean;
  runs: UnifiedRunScore100[];
}

export interface UnifiedBacklogItem {
  subsystem: CreSubsystemId;
  issueKey: string;
  targetFileHint: string;
  axis: string;
  track: string;
  pScore: number;
  tier: 'P0_immediate' | 'P1_near_term' | 'P2_experiment';
  anyFloorRisk: boolean;
  affectedPersonas: string[];
  summary: string;
}

export interface LayerDR3SubsystemInput {
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  negativeControlsPassed: boolean;
  groundedRatio: number;
  uiPersonaR3Mean5: number;
  deliverableR3Score5: number;
  r3FloorRisk: boolean;
}

export interface LayerDR3SubsystemSummary extends LayerDR3SubsystemInput {
  subsystem: CreSubsystemId;
  combinedR3Score5: number;
  r3Linear100: number;
  blendedEffective100: number;
  effectiveFloorRisk: boolean;
  meetsBlendedTarget90: boolean;
}

export interface UnifiedLayerDR3Report {
  subsystems: {
    im: LayerDR3SubsystemSummary;
    newsletter: LayerDR3SubsystemSummary;
    dealcard: LayerDR3SubsystemSummary;
    inbox?: LayerDR3SubsystemSummary;
  };
  overallR3LinearMean100: number;
  overallBlendedEffective100: number;
  anyR3FloorRisk: boolean;
  allNegativeControlsPassed: boolean;
  minGroundedRatio: number;
  totalCalls: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalEstimatedCostUsd: number;
}

export interface UnifiedCreReport100 {
  generatedAt: string;
  targetScore100: 90;
  subsystems: {
    im: SubsystemScorecard100;
    newsletter: SubsystemScorecard100;
    dealcard: SubsystemScorecard100;
    inbox?: SubsystemScorecard100;
  };
  overallRawMean100: number;
  overallEffectiveMean100: number;
  totalFloorRiskCount: number;
  readyForHuman2nd: boolean;
  topBacklog: UnifiedBacklogItem[];
  r3Audit?: UnifiedLayerDR3Report;
}

export const FLOOR_CAP_100 = 46.25 as const; // 25 * (2.85 - 1.0)

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function norm5To01(axisScore5: number): number {
  return Math.min(1, Math.max(0, (axisScore5 - 1.0) / 4.0));
}

type AnyPpgtScoreResult =
  | ImPpgtScoreResult
  | NewsletterPpgtScoreResult
  | DealCardPpgtScoreResult
  | InboxPpgtScoreResult;

export function convertPpgtRunTo100(
  subsystem: CreSubsystemId,
  run: AnyPpgtScoreResult,
): UnifiedRunScore100 {
  const u1 = norm5To01(run.r2Axes.U1_first10s_clarity);
  const u2 = norm5To01(run.r2Axes.U2_visual_ergonomics);
  const u3 = norm5To01(run.r2Axes.U3_flow_resilience);
  const c1 = norm5To01(run.r2Axes.C1_provenance_honesty);
  const c2 = norm5To01(run.r2Axes.C2_artifact_shareability);
  const c3 = norm5To01(run.r2Axes.C3_safe_domain_fit);

  const pillars: FourPillarBreakdown100 = {
    contentSuitability30: round2(30 * (0.55 * c3 + 0.45 * c1)),
    uxWriting20: round2(20 * (0.45 * u1 + 0.55 * c2)),
    zeroFrictionUx25: round2(25 * (0.65 * u2 + 0.35 * u1)),
    functionalCompleteness25: round2(25 * (0.6 * u3 + 0.4 * c2)),
  };

  const pillarSum100 = round2(
    pillars.contentSuitability30 +
      pillars.uxWriting20 +
      pillars.zeroFrictionUx25 +
      pillars.functionalCompleteness25,
  );
  const ppgtLinear100 = round2(25 * (run.weightedOverall - 1.0));
  const combined = round2(0.5 * pillarSum100 + 0.5 * ppgtLinear100);

  const effectiveScore100 = run.floorRisk
    ? round2(Math.min(combined, ppgtLinear100, FLOOR_CAP_100))
    : combined;

  return {
    subsystem,
    personaId: run.personaId,
    surface: run.surface,
    r2Weighted5: run.weightedOverall,
    pillars,
    pillarSum100,
    ppgtLinear100,
    effectiveScore100,
    floorRisk: run.floorRisk,
    floorReasons: [...run.floorReasons],
    syntheticSummary: run.syntheticSummary,
  };
}

const SUBSYSTEM_LABELS: Record<CreSubsystemId, string> = {
  im: 'IM (모바일 뷰어 · Basic/Pro PPTX · 16:9 PDF · 스튜디오)',
  newsletter: '부동산뉴스 (에디터 · 매거진 뷰어 · 구독 · OG)',
  dealcard: '딜카드 (메모 Fast-Fill · 블라인드 가드 · /dc/[id] · 카톡 OG)',
  inbox: '소통함 (고객 CRM · 409 미생성 IM 가드 · AI 답장 · VIP/중복 보호)',
};

export function summarizeSubsystem100(
  subsystem: CreSubsystemId,
  rawRuns: readonly AnyPpgtScoreResult[],
): SubsystemScorecard100 {
  const runs = rawRuns.map((r) => convertPpgtRunTo100(subsystem, r));
  if (runs.length === 0) {
    return {
      subsystem,
      labelKo: SUBSYSTEM_LABELS[subsystem],
      runCount: 0,
      pillarsMean: {
        contentSuitability30: 0,
        uxWriting20: 0,
        zeroFrictionUx25: 0,
        functionalCompleteness25: 0,
      },
      rawMeanScore100: 0,
      effectiveScore100: 0,
      minRunScore100: 0,
      floorRiskCount: 1,
      floorReasons: ['no_runs_executed'],
      meetsTarget90: false,
      runs: [],
    };
  }

  const n = runs.length;
  const pillarsMean: FourPillarBreakdown100 = {
    contentSuitability30: round2(
      runs.reduce((s, r) => s + r.pillars.contentSuitability30, 0) / n,
    ),
    uxWriting20: round2(runs.reduce((s, r) => s + r.pillars.uxWriting20, 0) / n),
    zeroFrictionUx25: round2(runs.reduce((s, r) => s + r.pillars.zeroFrictionUx25, 0) / n),
    functionalCompleteness25: round2(
      runs.reduce((s, r) => s + r.pillars.functionalCompleteness25, 0) / n,
    ),
  };

  const rawMeanScore100 = round2(runs.reduce((s, r) => s + r.effectiveScore100, 0) / n);
  const minRunScore100 = round2(Math.min(...runs.map((r) => r.effectiveScore100)));
  const floorRuns = runs.filter((r) => r.floorRisk);
  const floorRiskCount = floorRuns.length;
  const floorReasons = Array.from(
    new Set(floorRuns.flatMap((r) => r.floorReasons.map((reason) => `${r.personaId}@${r.surface}:${reason}`))),
  );

  // 비보상 서브시스템 캡: 과락 1건이라도 있으면 서브시스템 전체 점수도 <= 46.25로 캡핑
  const effectiveScore100 =
    floorRiskCount > 0 ? round2(Math.min(rawMeanScore100, FLOOR_CAP_100)) : rawMeanScore100;

  return {
    subsystem,
    labelKo: SUBSYSTEM_LABELS[subsystem],
    runCount: n,
    pillarsMean,
    rawMeanScore100,
    effectiveScore100,
    minRunScore100,
    floorRiskCount,
    floorReasons,
    meetsTarget90: effectiveScore100 >= 90.0 && floorRiskCount === 0,
    runs,
  };
}

/**
 * R3 스팬 근거(Span-Grounded) 검증 헬퍼:
 * 인용된 문구(`quotedSpan`)가 실제 관측된 DOM 텍스트/헤딩/버튼/배지 내에 존재하는지 확인.
 */
export function isSpanGrounded(
  quotedSpan: string,
  observedCorpus: readonly string[],
): boolean {
  const needle = quotedSpan.replace(/\s+/g, ' ').trim();
  if (needle.length < 2) return false;
  const haystack = observedCorpus.join(' \n ').replace(/\s+/g, ' ');
  return haystack.includes(needle);
}

/**
 * 선택적 R3(스팬 근거 LLM 심사) 결합 함수 (`0.70 * R2 + 0.30 * R3`, 비보상 캡 유지).
 */
export function blendScore100WithR3(params: {
  r2EffectiveScore100: number;
  r2FloorRisk: boolean;
  r3Score5: number;
  r3FloorRisk: boolean;
  quotedSpans: readonly string[];
  observedCorpus: readonly string[];
  syntheticNarrative: string;
}): { blendedScore100: number; floorRisk: boolean; groundedAll: boolean } {
  if (!params.syntheticNarrative.startsWith('[SIMULATED] ')) {
    throw new Error('INV-P06 violation: R3 narrative must begin with "[SIMULATED] "');
  }
  const groundedAll =
    params.quotedSpans.length > 0 &&
    params.quotedSpans.every((sp) => isSpanGrounded(sp, params.observedCorpus));

  const r3Linear100 = round2(25 * (Math.min(5, Math.max(1, params.r3Score5)) - 1.0));
  const anyFloor = params.r2FloorRisk || params.r3FloorRisk || !groundedAll;
  const rawBlended = groundedAll
    ? round2(0.7 * params.r2EffectiveScore100 + 0.3 * r3Linear100)
    : params.r2EffectiveScore100;

  return {
    blendedScore100: anyFloor ? round2(Math.min(rawBlended, FLOOR_CAP_100)) : rawBlended,
    floorRisk: anyFloor,
    groundedAll,
  };
}

type AnyBacklogCluster =
  | ImPpgtBacklogCluster
  | NewsletterPpgtBacklogCluster
  | DealCardPpgtBacklogCluster
  | InboxPpgtBacklogCluster;

function mapClusters(
  subsystem: CreSubsystemId,
  clusters: readonly AnyBacklogCluster[],
): UnifiedBacklogItem[] {
  return clusters.map((c) => ({
    subsystem,
    issueKey: c.issueKey,
    targetFileHint: c.targetFileHint,
    axis: c.axis,
    track: c.track,
    pScore: c.pScore,
    tier: c.tier,
    anyFloorRisk: c.anyFloorRisk,
    affectedPersonas: [...c.affectedPersonas],
    summary: c.summaries[0] || '',
  }));
}

function summarizeLayerDR3Subsystem(
  subsystem: CreSubsystemId,
  r2Card: SubsystemScorecard100,
  input: LayerDR3SubsystemInput,
): LayerDR3SubsystemSummary {
  const combinedR3Score5 = round2((input.uiPersonaR3Mean5 + input.deliverableR3Score5) / 2);
  const r3Linear100 = round2(25 * (Math.min(5, Math.max(1, combinedR3Score5)) - 1.0));
  const effectiveFloorRisk =
    r2Card.floorRiskCount > 0 ||
    input.r3FloorRisk ||
    !input.negativeControlsPassed ||
    input.groundedRatio < 0.5;
  const rawBlended = round2(0.7 * r2Card.effectiveScore100 + 0.3 * r3Linear100);
  const blendedEffective100 = effectiveFloorRisk
    ? round2(Math.min(rawBlended, FLOOR_CAP_100))
    : rawBlended;

  return {
    subsystem,
    ...input,
    combinedR3Score5,
    r3Linear100,
    blendedEffective100,
    effectiveFloorRisk,
    meetsBlendedTarget90: blendedEffective100 >= 90.0 && !effectiveFloorRisk,
  };
}

export function buildUnifiedCreReport100(params: {
  imRuns: readonly ImPpgtScoreResult[];
  newsletterRuns: readonly NewsletterPpgtScoreResult[];
  dealcardRuns: readonly DealCardPpgtScoreResult[];
  inboxRuns?: readonly InboxPpgtScoreResult[];
  imBacklog?: readonly ImPpgtBacklogCluster[];
  newsletterBacklog?: readonly NewsletterPpgtBacklogCluster[];
  dealcardBacklog?: readonly DealCardPpgtBacklogCluster[];
  inboxBacklog?: readonly InboxPpgtBacklogCluster[];
  r3Inputs?: {
    im: LayerDR3SubsystemInput;
    newsletter: LayerDR3SubsystemInput;
    dealcard: LayerDR3SubsystemInput;
    inbox?: LayerDR3SubsystemInput;
  };
}): UnifiedCreReport100 {
  const imCard = summarizeSubsystem100('im', params.imRuns);
  const nlCard = summarizeSubsystem100('newsletter', params.newsletterRuns);
  const dcCard = summarizeSubsystem100('dealcard', params.dealcardRuns);
  const inboxCard =
    params.inboxRuns !== undefined ? summarizeSubsystem100('inbox', params.inboxRuns) : undefined;

  const cards = inboxCard ? [imCard, nlCard, dcCard, inboxCard] : [imCard, nlCard, dcCard];
  const overallRawMean100 = round2(
    cards.reduce((s, c) => s + c.rawMeanScore100, 0) / cards.length,
  );
  const totalFloorRiskCount = cards.reduce((s, c) => s + c.floorRiskCount, 0);
  const meanEffective = round2(
    cards.reduce((s, c) => s + c.effectiveScore100, 0) / cards.length,
  );
  const overallEffectiveMean100 =
    totalFloorRiskCount > 0 ? round2(Math.min(meanEffective, FLOOR_CAP_100)) : meanEffective;

  const topBacklog = [
    ...mapClusters('im', params.imBacklog ?? []),
    ...mapClusters('newsletter', params.newsletterBacklog ?? []),
    ...mapClusters('dealcard', params.dealcardBacklog ?? []),
    ...mapClusters('inbox', params.inboxBacklog ?? []),
  ].sort((a, b) => b.pScore - a.pScore);

  let r3Audit: UnifiedLayerDR3Report | undefined;
  if (params.r3Inputs) {
    const imR3 = summarizeLayerDR3Subsystem('im', imCard, params.r3Inputs.im);
    const nlR3 = summarizeLayerDR3Subsystem('newsletter', nlCard, params.r3Inputs.newsletter);
    const dcR3 = summarizeLayerDR3Subsystem('dealcard', dcCard, params.r3Inputs.dealcard);
    const inboxR3 =
      inboxCard && params.r3Inputs.inbox
        ? summarizeLayerDR3Subsystem('inbox', inboxCard, params.r3Inputs.inbox)
        : undefined;
    const r3List = inboxR3 ? [imR3, nlR3, dcR3, inboxR3] : [imR3, nlR3, dcR3];
    const anyR3FloorRisk = r3List.some((x) => x.effectiveFloorRisk);
    const meanBlended = round2(
      r3List.reduce((s, x) => s + x.blendedEffective100, 0) / r3List.length,
    );
    r3Audit = {
      subsystems: {
        im: imR3,
        newsletter: nlR3,
        dealcard: dcR3,
        ...(inboxR3 ? { inbox: inboxR3 } : {}),
      },
      overallR3LinearMean100: round2(
        r3List.reduce((s, x) => s + x.r3Linear100, 0) / r3List.length,
      ),
      overallBlendedEffective100: anyR3FloorRisk
        ? round2(Math.min(meanBlended, FLOOR_CAP_100))
        : meanBlended,
      anyR3FloorRisk,
      allNegativeControlsPassed: r3List.every((x) => x.negativeControlsPassed),
      minGroundedRatio: round2(Math.min(...r3List.map((x) => x.groundedRatio))),
      totalCalls: r3List.reduce((s, x) => s + x.calls, 0),
      totalPromptTokens: r3List.reduce((s, x) => s + x.promptTokens, 0),
      totalCompletionTokens: r3List.reduce((s, x) => s + x.completionTokens, 0),
      totalEstimatedCostUsd:
        Math.round(r3List.reduce((s, x) => s + x.estimatedCostUsd, 0) * 10_000) / 10_000,
    };
  }

  const r2Ready =
    totalFloorRiskCount === 0 &&
    overallEffectiveMean100 >= 90.0 &&
    imCard.meetsTarget90 &&
    nlCard.meetsTarget90 &&
    dcCard.meetsTarget90 &&
    (inboxCard ? inboxCard.meetsTarget90 : true);

  const r3Ready = r3Audit
    ? !r3Audit.anyR3FloorRisk &&
      r3Audit.allNegativeControlsPassed &&
      r3Audit.minGroundedRatio >= 0.5 &&
      r3Audit.overallBlendedEffective100 >= 90.0 &&
      r3Audit.subsystems.im.meetsBlendedTarget90 &&
      r3Audit.subsystems.newsletter.meetsBlendedTarget90 &&
      r3Audit.subsystems.dealcard.meetsBlendedTarget90 &&
      (r3Audit.subsystems.inbox ? r3Audit.subsystems.inbox.meetsBlendedTarget90 : true)
    : true;

  const readyForHuman2nd = r2Ready && r3Ready;

  return {
    generatedAt: new Date().toISOString(),
    targetScore100: 90,
    subsystems: {
      im: imCard,
      newsletter: nlCard,
      dealcard: dcCard,
      ...(inboxCard ? { inbox: inboxCard } : {}),
    },
    overallRawMean100,
    overallEffectiveMean100,
    totalFloorRiskCount,
    readyForHuman2nd,
    topBacklog,
    ...(r3Audit ? { r3Audit } : {}),
  };
}

export function formatUnifiedCreScorecardMarkdown(report: UnifiedCreReport100): string {
  const activeIds: CreSubsystemId[] = report.subsystems.inbox
    ? ['im', 'newsletter', 'dealcard', 'inbox']
    : ['im', 'newsletter', 'dealcard'];
  const countLabel = activeIds.length === 4 ? '4대' : '3대';

  const rows = activeIds.map((id) => {
    const s = report.subsystems[id]!;
    return `| **${id.toUpperCase()}** | ${s.runCount} | ${s.pillarsMean.contentSuitability30.toFixed(1)} / 30 | ${s.pillarsMean.uxWriting20.toFixed(1)} / 20 | ${s.pillarsMean.zeroFrictionUx25.toFixed(1)} / 25 | ${s.pillarsMean.functionalCompleteness25.toFixed(1)} / 25 | **${s.effectiveScore100.toFixed(2)} / 100** | ${s.floorRiskCount}건 | ${s.meetsTarget90 ? 'PASS (90+)' : 'REMEDIATE'} |`;
  });

  const r3ActiveIds: CreSubsystemId[] = report.r3Audit?.subsystems.inbox
    ? ['im', 'newsletter', 'dealcard', 'inbox']
    : ['im', 'newsletter', 'dealcard'];

  const r3Section = report.r3Audit
    ? [
        '',
        '## 1-B. Layer D (`R3` 반아첨 멀티모달 Vision + Span-Grounded) Blended 100점 스코어카드 (`0.70 * R2 + 0.30 * R3`)',
        `- R3 실측 API 총계: \`${report.r3Audit.totalCalls}\` calls · \`${report.r3Audit.totalPromptTokens.toLocaleString()}\` prompt / \`${report.r3Audit.totalCompletionTokens.toLocaleString()}\` completion tokens · 총 비용 **\`$${report.r3Audit.totalEstimatedCostUsd.toFixed(4)}\`**`,
        `- 반아첨 음성 대조군 전체 통과: **${report.r3Audit.allNegativeControlsPassed ? 'PASS' : 'FAIL'}** · 최소 원문 접지율(\`isSpanGrounded\`): **${(report.r3Audit.minGroundedRatio * 100).toFixed(1)}%** (기준 >= 50%)`,
        `- ${r3ActiveIds.length}대 서브시스템 통합 **Blended 유효 평균: \`${report.r3Audit.overallBlendedEffective100.toFixed(2)} / 100점\`** (R3 단독 평균: ${report.r3Audit.overallR3LinearMean100.toFixed(2)}점, 과락: ${report.r3Audit.anyR3FloorRisk ? 'YES' : '0건'})`,
        '',
        '| 서브시스템 | R2 유효(100) | R3 UI(5.0) | R3 산출물(5.0) | R3 환산(100) | **Blended(100)** | 음성대조군 | 접지율 | 판정 |',
        '|:--|--:|--:|--:|--:|--:|:--:|--:|:--:|',
        ...r3ActiveIds.map((id) => {
          const r2 = report.subsystems[id]!;
          const r3 = report.r3Audit!.subsystems[id]!;
          return `| **${id.toUpperCase()}** | ${r2.effectiveScore100.toFixed(2)} | ${r3.uiPersonaR3Mean5.toFixed(2)} | ${r3.deliverableR3Score5.toFixed(2)} | ${r3.r3Linear100.toFixed(2)} | **${r3.blendedEffective100.toFixed(2)} / 100** | ${r3.negativeControlsPassed ? 'PASS' : 'FAIL'} | ${(r3.groundedRatio * 100).toFixed(1)}% | ${r3.meetsBlendedTarget90 ? 'PASS (90+)' : 'REMEDIATE'} |`;
        }),
      ]
    : [];

  const lines = [
    `# CRE ${countLabel} 서브시스템 통합 100점 루브릭 스코어카드 (AI 1st Gate)`,
    '',
    `- 생성 시각: ${report.generatedAt}`,
    `- 결정론(R1+R2) 유효 평균: **${report.overallEffectiveMean100.toFixed(2)} / 100점** (산술 원점수 평균: ${report.overallRawMean100.toFixed(2)}점)`,
    ...(report.r3Audit
      ? [
          `- **R2+R3 Blended 최종 유효 평균: \`${report.r3Audit.overallBlendedEffective100.toFixed(2)} / 100점\`** (\`0.70 * R2 + 0.30 * R3\`)`,
        ]
      : []),
    `- 총 과락(floorRisk) 건수: **${report.totalFloorRiskCount}건**`,
    `- 인간 2nd 검수 진입 가능 여부: **${report.readyForHuman2nd ? 'READY (진입 승인)' : 'BLOCKED (AI 1st 교정 필요)'}**`,
    '',
    '## 1. 서브시스템별 4대 영역 결정론(R1+R2) 채점표',
    '| 서브시스템 | 프로브 수 | ① 콘텐츠 적합성(30) | ② UX 라이팅(20) | ③ UX 무마찰(25) | ④ 기능 완전성(25) | 유효 총점(100) | 과락 | 판정 |',
    '|:--|--:|--:|--:|--:|--:|--:|--:|:--:|',
    ...rows,
    ...r3Section,
    '',
    '## 2. 상위 P-Score 결함 백로그 (AI 1st 교정 대상)',
    ...(report.topBacklog.length === 0
      ? ['- P0/P1/P2 잔여 결함 0건']
      : [
          '| 순위 | 서브시스템 | 등급 | P-Score | 이슈 키 | 타겟 파일 | 요약 |',
          '|--:|:--|:--|--:|:--|:--|:--|',
          ...report.topBacklog
            .slice(0, 20)
            .map(
              (b, idx) =>
                `| ${idx + 1} | ${b.subsystem} | ${b.tier} | ${b.pScore.toFixed(2)} | \`${b.issueKey}\` | \`${b.targetFileHint}\` | ${b.summary} |`,
            ),
        ]),
  ];

  if (report.totalFloorRiskCount > 0) {
    lines.push('', '## 3. 과락(floorRisk) 상세 사유');
    for (const id of activeIds) {
      const card = report.subsystems[id];
      if (!card) continue;
      for (const reason of card.floorReasons) {
        lines.push(`- [${id.toUpperCase()}] ${reason}`);
      }
    }
  }

  return lines.join('\n');
}
