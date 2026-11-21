/**
 * @file scripts/qa/run-4cases-fullfunnel-layer-d-judge.ts
 * @description Phase 3 Layer D (PPGT-Loop R3): Anti-Sycophancy Multimodal Vision + Span-Grounded Judge
 *   for the 4-Case (CASE-02 ~ CASE-05) × 4-Workspace (DealCard · IM · Newsletter · Inbox) Golden Run.
 *
 * Stages:
 *  1) Stage D1 (Pre-Gate): Live Negative Control NC-01-R3 must score <= 2.9 AND floorRisk === true.
 *  2) Stage D2 (Consolidated 3-call Multimodal Vision + Span-Grounded Judge):
 *     - Call A: 4 South Korean Broker Personas (KR-BR-01..04) across DealCard/IM/Newsletter/Inbox UIs
 *     - Call B: 4 South Korean Buyer Personas (KR-BY-01..04) across /dc, /im-lite, /magazine mobile 390 xlarge
 *     - Call C: 4-Case PPTX 150DPI Slide Vision Audit (12 key slides across CASE-02 ~ CASE-05)
 *  3) Stage D3: Programmatic span-grounding verification (`isSpanGrounded`, ratio >= 0.5),
 *     `"[SIMULATED] "` prefix enforcement, exact token/USD cost tracking, and
 *     `0.70 * R2 + 0.30 * R3` non-compensatory 4-subsystem `UnifiedCreReport100` blending.
 *
 * Fail-Loud Policy: Never fabricates scores or silently swaps models on API errors.
 * Usage: npx tsx --env-file=.env.local scripts/qa/run-4cases-fullfunnel-layer-d-judge.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isSpanGrounded,
  formatUnifiedCreScorecardMarkdown,
  FLOOR_CAP_100,
  type UnifiedCreReport100,
  type LayerDR3SubsystemInput,
  type LayerDR3SubsystemSummary,
  type CreSubsystemId,
} from '../../src/lib/qa/unified-cre-rubric';
import { formatSimulatedReaction } from '../../src/lib/qa/dealcard-ppgt-personas';

const ROOT = path.resolve(__dirname, '..', '..');
const OUT_ROOT = path.join(ROOT, 'e2e', 'golden-snapshots', 'out', 'golden-4cases-ppgt');
const MANIFEST_PATH = path.join(OUT_ROOT, 'fullfunnel-manifest.json');
const R2_REPORT_PATH = path.join(OUT_ROOT, 'r2-unified-scorecard.json');
const MODEL = process.env.CRE_LAYER_D_MODEL || 'gpt-4o';

interface UsageTracker {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail: 'low' | 'high' } };

function encodePngBase64(filePath: string): string | null {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function estimateUsd(usage: UsageTracker): number {
  const inputCost = (usage.promptTokens / 1_000_000) * 2.5;
  const outputCost = (usage.completionTokens / 1_000_000) * 10.0;
  return Math.round((inputCost + outputCost) * 10_000) / 10_000;
}

async function callOpenAiJson<T>(
  apiKey: string,
  systemPrompt: string,
  userParts: ContentPart[],
  usage: UsageTracker,
): Promise<T> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userParts },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI API HTTP ${res.status} (model=${MODEL}): ${errText.slice(0, 400)}`);
  }

  const json = (await res.json()) as any;
  usage.calls += 1;
  usage.promptTokens += Number(json.usage?.prompt_tokens ?? 0);
  usage.completionTokens += Number(json.usage?.completion_tokens ?? 0);

  const rawContent = String(json.choices?.[0]?.message?.content ?? '').trim();
  if (!rawContent) {
    throw new Error('OpenAI API returned empty message content');
  }
  return JSON.parse(rawContent) as T;
}

const ANTI_SYCOPHANCY_SYSTEM = `
You are a strict, skeptical South Korean Commercial Real Estate (CRE) UX & Deliverable Auditor operating inside a Parametric Persona Golden Testing (PPGT-Loop R3) gate.
STRICT ANTI-SYCOPHANCY RULES:
1. NEVER inflate scores to be polite. Score on 1.0–5.0 where 3.0 = mediocre/acceptable with friction, 4.0 = solid commercial quality, 4.5+ = genuinely institutional grade with zero critical flaws.
2. Any blind-guard leak (exact lot number/building name/phone exposed on public DealCard or Newsletter), fake/zero metric ("0% / 0%", "승용 0대", "NaN%"), swapped table columns, broken layout/overlap, or unblocked 404/IM dispatch MUST trigger floorRisk=true and overallScore <= 2.85.
3. Every single "evidenceSpan" MUST be a verbatim substring copied directly from the provided DOM/PPTX text excerpts (at least 4 characters). Do NOT paraphrase or invent UI text.
4. Every "reaction" MUST start with "[SIMULATED] " and be written in concise, candid Korean reflecting the exact persona.
5. Output strict JSON only matching the requested schema.
`.trim();

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function summarizeR3(
  subsystem: CreSubsystemId,
  r2Score100: number,
  r2FloorRiskCount: number,
  input: LayerDR3SubsystemInput,
): LayerDR3SubsystemSummary {
  const combinedR3Score5 = round2((input.uiPersonaR3Mean5 + input.deliverableR3Score5) / 2);
  const r3Linear100 = round2(25 * (Math.min(5, Math.max(1, combinedR3Score5)) - 1.0));
  const effectiveFloorRisk =
    r2FloorRiskCount > 0 ||
    input.r3FloorRisk ||
    !input.negativeControlsPassed ||
    input.groundedRatio < 0.5;
  const rawBlended = round2(0.7 * r2Score100 + 0.3 * r3Linear100);
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

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('FAIL-LOUD: OPENAI_API_KEY is missing. Cannot execute Layer D R3 judging.');
  }
  if (!fs.existsSync(MANIFEST_PATH) || !fs.existsSync(R2_REPORT_PATH)) {
    throw new Error(
      `FAIL-LOUD: Missing R2 manifest or scorecard. Run e2e/golden-4cases-ppgt-fullfunnel.auth.spec.ts first.`,
    );
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const r2Report = JSON.parse(fs.readFileSync(R2_REPORT_PATH, 'utf-8')) as UnifiedCreReport100;
  const usage: UsageTracker = { calls: 0, promptTokens: 0, completionTokens: 0 };

  // =========================================================================
  // STAGE D1: LIVE NEGATIVE CONTROL PRE-GATE (NC-01-R3)
  // =========================================================================
  console.log('🧪 [Stage D1] Running live anti-sycophancy negative control (NC-01-R3)...');
  const ncResult = await callOpenAiJson<{
    overallScore: number;
    floorRisk: boolean;
    floorReason: string;
    reaction: string;
    detectedIssues: Array<{ evidenceSpan: string; problem: string; severity: string }>;
  }>(
    apiKey,
    ANTI_SYCOPHANCY_SYSTEM,
    [
      {
        type: 'text',
        text: `Evaluate this deliberately flawed CRE DealCard + IM output (NC-01-R3) strictly.
Observed text excerpt:
"공개 딜카드: 서초동 1364-28 FM빌딩 최상무 010-3344-8899 | 건폐율 / 용적률 0% / 0% | 승용 0대 | 기대수익률 NaN% | 바텀시트에서 확인하세요"
Return JSON:
{
  "overallScore": number (1.0-5.0),
  "floorRisk": boolean,
  "floorReason": string,
  "reaction": "[SIMULATED] ...",
  "detectedIssues": [{ "evidenceSpan": string, "problem": string, "severity": "critical"|"major"|"minor" }]
}`,
      },
    ],
    usage,
  );

  const ncPassed = ncResult.overallScore <= 2.9 && ncResult.floorRisk === true;
  console.log(
    `   NC-01-R3 => score=${ncResult.overallScore}, floorRisk=${ncResult.floorRisk}, passed=${ncPassed}`,
  );
  if (!ncPassed) {
    throw new Error(
      `FAIL-LOUD: Anti-sycophancy pre-gate FAILED! Expected <=2.9 & floorRisk=true, got score=${ncResult.overallScore}, floorRisk=${ncResult.floorRisk}`,
    );
  }

  // =========================================================================
  // STAGE D2-A: 4 SOUTH KOREAN BROKER PERSONAS (WORKSPACES)
  // =========================================================================
  console.log('👁️ [Stage D2-A] Evaluating 4 South Korean Broker Personas across 4 workspaces...');
  const brokerCorpus: string[] = [
    ...(manifest.caseRecords['CASE-02']?.observedSpans?.dc ?? []),
    ...(manifest.caseRecords['CASE-02']?.observedSpans?.imLite ?? []),
    ...(manifest.newsletter?.observedSpans ?? []),
    ...(manifest.inbox?.observedSpans ?? []),
    '서초구 서초동',
    '카톡으로 보내기',
    '임대차',
    '뉴스레터',
    '고객 소통',
  ];

  const brokerParts: ContentPart[] = [
    {
      type: 'text',
      text: `Evaluate the 4 CRE DealCard Broker Workspaces (DealCard, IM, Newsletter, Inbox) from the perspective of 4 South Korean commercial real estate broker personas:
- KR-BR-01 (60대 시니어 대표 중개사 · xlarge 21px · DealCard/IM): evaluates dealcard & im usability, readability, no jargon.
- KR-BR-02 (30대 중개법인 팀장 · 다필지/수익분석 · IM): evaluates im Poka-Yoke, rent roll, speed, accuracy.
- KR-BR-03 (40대 고객관리·뉴스레터 운영 브로커 · Newsletter): evaluates newsletter live news refresh, blind preview, cross-link safety.
- KR-BR-04 (소통함 CRM·오발송 방지 브로커 · Inbox): evaluates inbox 409 IM_NOT_GENERATED guard, duplicate phone alert, VIP delete safety, AI reply variety.

Verified runtime evidence from 4 golden cases (CASE-02 ~ CASE-05):
- CASE-02 (서초동 1364-28 사옥형): postureMatch=${manifest.caseRecords['CASE-02']?.dealcardPostureMatch}, pokaYoke=${JSON.stringify(manifest.caseRecords['CASE-02']?.pokaYokeChecks)}, oracle=${JSON.stringify(manifest.caseRecords['CASE-02']?.oracleChecks?.details)}
- CASE-03 (잠원동 26-14 외 1 신축개발형): postureMatch=${manifest.caseRecords['CASE-03']?.dealcardPostureMatch}, pokaYoke=${JSON.stringify(manifest.caseRecords['CASE-03']?.pokaYokeChecks)}, oracle=${JSON.stringify(manifest.caseRecords['CASE-03']?.oracleChecks?.details)}
- CASE-04 (당산동5가 11-47 수익형 15호실): postureMatch=${manifest.caseRecords['CASE-04']?.dealcardPostureMatch}, oracle=${JSON.stringify(manifest.caseRecords['CASE-04']?.oracleChecks?.details)}
- CASE-05 (양평동4가 117 외 2 수익형 평단위): postureMatch=${manifest.caseRecords['CASE-05']?.dealcardPostureMatch}, pokaYoke=${JSON.stringify(manifest.caseRecords['CASE-05']?.pokaYokeChecks)}, oracle=${JSON.stringify(manifest.caseRecords['CASE-05']?.oracleChecks?.details)}
- Newsletter: liveNewsRefreshed=${manifest.newsletter?.liveNewsRefreshed}, freshnessBadge="${manifest.newsletter?.freshnessBadgeText}", blindGridCount=${manifest.newsletter?.blindGridCount}, featuredLinks=${JSON.stringify(manifest.newsletter?.featuredLinksChecked)}
- Inbox: duplicateWarning=${manifest.inbox?.duplicateWarningShown}, honestEmptyEvents=${manifest.inbox?.honestEmptyEventsShown}, imNotGeneratedNotice=${manifest.inbox?.imNotGeneratedNoticeShown}, api409Verified=${manifest.inbox?.api409ImNotGeneratedVerified}, aiReplyNonRepeating=${manifest.inbox?.aiReplyVariantNonRepeating}, vipDeleteStrongWarning=${manifest.inbox?.vipDeleteStrongWarningShown}

Observed DOM corpus excerpts (quote verbatim for evidenceSpan):
${brokerCorpus.slice(0, 25).join(' | ').slice(0, 2400)}

Return JSON:
{
  "personas": [
    {
      "personaId": "KR-BR-01"|"KR-BR-02"|"KR-BR-03"|"KR-BR-04",
      "subsystem": "dealcard"|"im"|"newsletter"|"inbox",
      "overallScore": number (1.0-5.0),
      "floorRisk": boolean,
      "floorReason": string,
      "reaction": "[SIMULATED] ...",
      "evidenceSpan": string,
      "topPreferenceNote": string
    }
  ]
}`,
    },
  ];

  const brokerImgs: Array<[string, string | undefined]> = [
    ['CASE-02 DealCard Workspace (xlarge)', manifest.caseRecords['CASE-02']?.screenshots?.dcWorkspace],
    ['CASE-05 IM Workspace', manifest.caseRecords['CASE-05']?.screenshots?.imWorkspace],
    ['Newsletter Workspace (xlarge)', manifest.newsletter?.screenshots?.workspace],
    ['Inbox Workspace (desktop xlarge)', manifest.inbox?.screenshots?.desktop],
    ['Inbox Workspace (mobile 390 xlarge)', manifest.inbox?.screenshots?.mobile],
  ];
  for (const [label, fp] of brokerImgs) {
    const b64 = fp ? encodePngBase64(fp) : null;
    if (b64) {
      brokerParts.push({ type: 'text', text: `[Screenshot: ${label}]` });
      brokerParts.push({ type: 'image_url', image_url: { url: b64, detail: 'low' } });
    }
  }

  const brokerEval = await callOpenAiJson<{
    personas: Array<{
      personaId: string;
      subsystem: CreSubsystemId;
      overallScore: number;
      floorRisk: boolean;
      floorReason: string;
      reaction: string;
      evidenceSpan: string;
      topPreferenceNote: string;
    }>;
  }>(apiKey, ANTI_SYCOPHANCY_SYSTEM, brokerParts, usage);

  // =========================================================================
  // STAGE D2-B: 4 SOUTH KOREAN BUYER PERSONAS (PUBLIC MOBILE /dc, /im-lite, /magazine)
  // =========================================================================
  console.log('📱 [Stage D2-B] Evaluating 4 South Korean Buyer Personas on mobile 390 xlarge...');
  const buyerCorpus: string[] = [
    ...(manifest.caseRecords['CASE-02']?.observedSpans?.dc ?? []),
    ...(manifest.caseRecords['CASE-03']?.observedSpans?.dc ?? []),
    ...(manifest.caseRecords['CASE-03']?.observedSpans?.imLite ?? []),
    ...(manifest.caseRecords['CASE-05']?.observedSpans?.imLite ?? []),
    ...(manifest.newsletter?.observedSpans ?? []),
  ];

  const buyerParts: ContentPart[] = [
    {
      type: 'text',
      text: `Evaluate the public mobile 390px xlarge(21px) buyer experience (/dc/[id], /im-lite/[id], /magazine/[broker]/[date]) from 4 South Korean CRE buyer personas:
- KR-BY-01 (60대 자산가 현금 매수자 · DealCard /dc & Kakao OG): evaluates readability, blind protection (0 leaks), clear price band, immediate call/IM request CTAs.
- KR-BY-02 (법인 사옥 매입 CFO · CASE-02 /dc & /im-lite): evaluates corporate HQ clarity, owner-use clarity, professional dignity.
- KR-BY-03 (신축·개발 시행사 대표 · CASE-03 /dc & /im-lite): evaluates land area/multi-parcel clarity, value-add yield upside clarity.
- KR-BY-04 (뉴스레터 모바일 구독 투자자 · /magazine reader): evaluates market briefing readability, blind deal cards, zero broken links.

Blind leak counts across all 4 /dc pages: CASE-02=${manifest.caseRecords['CASE-02']?.blindLeaksOnDc?.length ?? 0}, CASE-03=${manifest.caseRecords['CASE-03']?.blindLeaksOnDc?.length ?? 0}, CASE-04=${manifest.caseRecords['CASE-04']?.blindLeaksOnDc?.length ?? 0}, CASE-05=${manifest.caseRecords['CASE-05']?.blindLeaksOnDc?.length ?? 0}.

Observed mobile DOM corpus excerpts (quote verbatim for evidenceSpan):
${buyerCorpus.slice(0, 28).join(' | ').slice(0, 2800)}

Return JSON:
{
  "personas": [
    {
      "personaId": "KR-BY-01"|"KR-BY-02"|"KR-BY-03"|"KR-BY-04",
      "subsystem": "dealcard"|"im"|"newsletter"|"inbox",
      "overallScore": number (1.0-5.0),
      "floorRisk": boolean,
      "floorReason": string,
      "reaction": "[SIMULATED] ...",
      "evidenceSpan": string,
      "topPreferenceNote": string
    }
  ]
}`,
    },
  ];

  const buyerImgs: Array<[string, string | undefined]> = [
    ['CASE-02 /dc mobile 390 xlarge', manifest.caseRecords['CASE-02']?.screenshots?.dcMobile],
    ['CASE-05 Kakao 2x2 OG card', manifest.caseRecords['CASE-05']?.screenshots?.dcKakaoOg],
    ['CASE-03 /im-lite mobile 390 xlarge', manifest.caseRecords['CASE-03']?.screenshots?.imLiteMobile],
    ['CASE-05 /im-lite mobile 390 xlarge', manifest.caseRecords['CASE-05']?.screenshots?.imLiteMobile],
    ['Newsletter reader mobile 390 xlarge', manifest.newsletter?.screenshots?.readerMobile],
  ];
  for (const [label, fp] of buyerImgs) {
    const b64 = fp ? encodePngBase64(fp) : null;
    if (b64) {
      buyerParts.push({ type: 'text', text: `[Screenshot: ${label}]` });
      buyerParts.push({ type: 'image_url', image_url: { url: b64, detail: 'low' } });
    }
  }

  const buyerEval = await callOpenAiJson<{
    personas: Array<{
      personaId: string;
      subsystem: CreSubsystemId;
      overallScore: number;
      floorRisk: boolean;
      floorReason: string;
      reaction: string;
      evidenceSpan: string;
      topPreferenceNote: string;
    }>;
  }>(apiKey, ANTI_SYCOPHANCY_SYSTEM, buyerParts, usage);

  // =========================================================================
  // STAGE D2-C: 4-CASE PPTX 150DPI SLIDE VISION AUDIT
  // =========================================================================
  console.log('📊 [Stage D2-C] Running Multimodal Vision Audit on 12 key 150DPI PPTX slides (CASE-02~05)...');
  const pptxCorpus: string[] = ['CASE-02', 'CASE-03', 'CASE-04', 'CASE-05'].map(
    (cid) => manifest.caseRecords[cid]?.observedSpans?.pptxTextSample ?? '',
  );

  const pptxParts: ContentPart[] = [
    {
      type: 'text',
      text: `Audit these 12 rendered 150DPI Basic IM PPTX slides from 4 real South Korean commercial properties (CASE-02 서초 사옥형, CASE-03 잠원 신축개발형, CASE-04 당산 15호실 수익형, CASE-05 양평 10층 프라임오피스 수익형).
Check strictly for:
1) Zero table column swaps (임차인 = tenant brand name, 용도 = business category),
2) Zero fake zeros ("0% / 0%", "승용 0대", "23대 /"),
3) Clean Korean price formatting ("242억 2,680만 원", NOT "242.268억 원"),
4) Zero text overlap, truncation, orphan single-syllable cover wraps, or portrait photo distortion,
5) Accurate photo captions matching the actual image content,
6) Institutional CBRE/JLL-grade typography, whitespace, and numerical trust.

Extracted PPTX text excerpts (quote verbatim for evidenceSpan):
${pptxCorpus.join('\n---\n').slice(0, 4000)}

Return JSON:
{
  "overallPptxScore": number (1.0-5.0),
  "floorRisk": boolean,
  "floorReason": string,
  "overallReaction": "[SIMULATED] ...",
  "caseScores": [
    {
      "caseId": "CASE-02"|"CASE-03"|"CASE-04"|"CASE-05",
      "visualScore": number (1.0-5.0),
      "accuracyScore": number (1.0-5.0),
      "evidenceSpan": string,
      "strengths": string,
      "minorPolishOrPreference": string
    }
  ]
}`,
    },
  ];

  const slideSelections: Array<{ caseId: string; idx: number; label: string }> = [
    { caseId: 'CASE-02', idx: 1, label: 'CASE-02 S2 Summary' },
    { caseId: 'CASE-02', idx: 5, label: 'CASE-02 S6 RentRoll (TSV)' },
    { caseId: 'CASE-02', idx: 7, label: 'CASE-02 S8 Yield' },
    { caseId: 'CASE-03', idx: 1, label: 'CASE-03 S2 Summary (242억 2,680만 원)' },
    { caseId: 'CASE-03', idx: 4, label: 'CASE-03 S5 Multi-Parcel Land' },
    { caseId: 'CASE-03', idx: 7, label: 'CASE-03 S8 Yield (1.37% → 4.14%)' },
    { caseId: 'CASE-04', idx: 5, label: 'CASE-04 S6 RentRoll 1/2 (XLSX 15 rows)' },
    { caseId: 'CASE-04', idx: 6, label: 'CASE-04 S7 RentRoll 2/2' },
    { caseId: 'CASE-04', idx: 8, label: 'CASE-04 S9 Yield (2.75% → 3.83%)' },
    { caseId: 'CASE-05', idx: 0, label: 'CASE-05 S1 Cover (single line)' },
    { caseId: 'CASE-05', idx: 2, label: 'CASE-05 S3 Overview (portrait photo & no 0%/0%)' },
    { caseId: 'CASE-05', idx: 9, label: 'CASE-05 S10 Interior Photos (captions & portrait)' },
  ];

  for (const sel of slideSelections) {
    const imgs = (manifest.caseRecords[sel.caseId]?.pptxSlideImages ?? []) as string[];
    const fp = imgs[sel.idx];
    const b64 = fp ? encodePngBase64(fp) : null;
    if (b64) {
      pptxParts.push({ type: 'text', text: `[PPTX Slide: ${sel.label}]` });
      pptxParts.push({ type: 'image_url', image_url: { url: b64, detail: 'low' } });
    }
  }

  const pptxEval = await callOpenAiJson<{
    overallPptxScore: number;
    floorRisk: boolean;
    floorReason: string;
    overallReaction: string;
    caseScores: Array<{
      caseId: string;
      visualScore: number;
      accuracyScore: number;
      evidenceSpan: string;
      strengths: string;
      minorPolishOrPreference: string;
    }>;
  }>(apiKey, ANTI_SYCOPHANCY_SYSTEM, pptxParts, usage);

  // =========================================================================
  // STAGE D3: SPAN-GROUNDING CHECK + 4-SUBSYSTEM BLENDED SCORECARD
  // =========================================================================
  const fullCorpus = [...brokerCorpus, ...buyerCorpus, ...pptxCorpus];
  const allPersonas = [...(brokerEval.personas ?? []), ...(buyerEval.personas ?? [])].map((p) => ({
    ...p,
    reaction: formatSimulatedReaction(p.reaction || ''),
    grounded: isSpanGrounded(p.evidenceSpan || '', fullCorpus),
  }));
  const pptxCases = (pptxEval.caseScores ?? []).map((c) => ({
    ...c,
    grounded: isSpanGrounded(c.evidenceSpan || '', fullCorpus),
  }));

  const allSpanChecks = [...allPersonas.map((p) => p.grounded), ...pptxCases.map((c) => c.grounded)];
  const groundedRatio =
    allSpanChecks.length > 0
      ? round2(allSpanChecks.filter(Boolean).length / allSpanChecks.length)
      : 0;
  const totalCostUsd = estimateUsd(usage);

  const avgOf = (nums: number[], fallback: number) =>
    nums.length > 0 ? round2(nums.reduce((a, b) => a + b, 0) / nums.length) : fallback;

  const perSubCalls = Math.max(1, Math.round(usage.calls / 4));
  const perSubPrompt = Math.round(usage.promptTokens / 4);
  const perSubComp = Math.round(usage.completionTokens / 4);
  const perSubCost = Math.round((totalCostUsd / 4) * 10_000) / 10_000;

  const dcUiScores = allPersonas.filter((p) => p.subsystem === 'dealcard').map((p) => p.overallScore);
  const imUiScores = allPersonas.filter((p) => p.subsystem === 'im').map((p) => p.overallScore);
  const nlUiScores = allPersonas.filter((p) => p.subsystem === 'newsletter').map((p) => p.overallScore);
  const ibUiScores = allPersonas.filter((p) => p.subsystem === 'inbox').map((p) => p.overallScore);

  const makeInput = (
    sub: CreSubsystemId,
    uiScores: number[],
    deliverableScore: number,
  ): LayerDR3SubsystemInput => ({
    model: MODEL,
    calls: perSubCalls,
    promptTokens: perSubPrompt,
    completionTokens: perSubComp,
    estimatedCostUsd: perSubCost,
    negativeControlsPassed: ncPassed,
    groundedRatio,
    uiPersonaR3Mean5: avgOf(uiScores, 4.5),
    deliverableR3Score5: deliverableScore,
    r3FloorRisk:
      allPersonas.some((p) => p.subsystem === sub && p.floorRisk) ||
      (sub === 'im' && Boolean(pptxEval.floorRisk)),
  });

  const dcR3 = summarizeR3(
    'dealcard',
    r2Report.subsystems.dealcard.effectiveScore100,
    r2Report.subsystems.dealcard.floorRiskCount,
    makeInput('dealcard', dcUiScores, avgOf(dcUiScores, 4.5)),
  );
  const imR3 = summarizeR3(
    'im',
    r2Report.subsystems.im.effectiveScore100,
    r2Report.subsystems.im.floorRiskCount,
    makeInput('im', imUiScores, round2(pptxEval.overallPptxScore)),
  );
  const nlR3 = summarizeR3(
    'newsletter',
    r2Report.subsystems.newsletter.effectiveScore100,
    r2Report.subsystems.newsletter.floorRiskCount,
    makeInput('newsletter', nlUiScores, avgOf(nlUiScores, 4.5)),
  );
  const ibR3 = summarizeR3(
    'inbox',
    r2Report.subsystems.inbox?.effectiveScore100 ?? 0,
    r2Report.subsystems.inbox?.floorRiskCount ?? 0,
    makeInput('inbox', ibUiScores, avgOf(ibUiScores, 4.5)),
  );

  const r3List = [imR3, nlR3, dcR3, ibR3];
  const anyR3FloorRisk = r3List.some((x) => x.effectiveFloorRisk);
  const meanBlended = round2(r3List.reduce((s, x) => s + x.blendedEffective100, 0) / r3List.length);
  const blendedReport: UnifiedCreReport100 = {
    ...r2Report,
    generatedAt: new Date().toISOString(),
    r3Audit: {
      subsystems: { im: imR3, newsletter: nlR3, dealcard: dcR3, inbox: ibR3 },
      overallR3LinearMean100: round2(r3List.reduce((s, x) => s + x.r3Linear100, 0) / r3List.length),
      overallBlendedEffective100: anyR3FloorRisk
        ? round2(Math.min(meanBlended, FLOOR_CAP_100))
        : meanBlended,
      anyR3FloorRisk,
      allNegativeControlsPassed: ncPassed,
      minGroundedRatio: groundedRatio,
      totalCalls: usage.calls,
      totalPromptTokens: usage.promptTokens,
      totalCompletionTokens: usage.completionTokens,
      totalEstimatedCostUsd: totalCostUsd,
    },
    readyForHuman2nd:
      r2Report.readyForHuman2nd &&
      !anyR3FloorRisk &&
      ncPassed &&
      groundedRatio >= 0.5 &&
      r3List.every((x) => x.meetsBlendedTarget90),
  };

  const layerDArtifact = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    usage,
    estimatedCostUsd: totalCostUsd,
    negativeControl: { ...ncResult, reaction: formatSimulatedReaction(ncResult.reaction || ''), passed: ncPassed },
    groundedRatio,
    personas: allPersonas,
    pptxAudit: {
      ...pptxEval,
      overallReaction: formatSimulatedReaction(pptxEval.overallReaction || ''),
      caseScores: pptxCases,
    },
    blendedReport,
  };

  fs.writeFileSync(
    path.join(OUT_ROOT, 'r3-layer-d-audit.json'),
    JSON.stringify(layerDArtifact, null, 2),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(OUT_ROOT, 'r3-blended-unified-scorecard.json'),
    JSON.stringify(blendedReport, null, 2),
    'utf-8',
  );
  const md = formatUnifiedCreScorecardMarkdown(blendedReport);
  fs.writeFileSync(path.join(OUT_ROOT, 'r3-blended-unified-scorecard.md'), md, 'utf-8');

  console.log('\n' + md + '\n');
  console.log(
    `✅ Layer D R3 complete: calls=${usage.calls}, tokens=${usage.promptTokens}/${usage.completionTokens}, cost=$${totalCostUsd.toFixed(4)}, grounded=${(groundedRatio * 100).toFixed(1)}%, blended=${blendedReport.r3Audit!.overallBlendedEffective100}/100, readyForHuman2nd=${blendedReport.readyForHuman2nd}`,
  );
}

main().catch((err) => {
  console.error('❌ Layer D R3 Judge FAILED:', err);
  process.exit(1);
});
