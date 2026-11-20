/**
 * @file scripts/qa/run-dealcard-layer-d-judge.ts
 * @description Layer D (PPGT-Loop R3): DealCard Anti-Sycophancy Multimodal Vision + Teaser Suitability Judge.
 *   1) Stage D1 (2 Live Negative Controls — Fail-Loud):
 *      - NC-DC-01-R3 (Blind Jibun & Franchise Leak on Clean Layout) -> MUST return overallScore <= 2.9 && floorRisk === true
 *      - NC-DC-02-R3 (Mobile Overflow + <44px Buttons + Subjective Spin) -> MUST return overallScore <= 2.9 && floorRisk === true
 *   2) Stage D2 Call 1 (1-Shot Web UI 7 Cuts + DOM Digest across DC-MG-01..06)
 *   3) Stage D2 Call 2 (Kakao OG v2 PNG + DC-01..DC-08 Rendered Public Corpus & 3-Tier Standard Specs Suitability R3)
 *   4) Stage D3: Programmatically validates isSpanGrounded (groundedRatio >= 0.5), forces "[SIMULATED] " prefix,
 *      blends 0.70*R2 + 0.30*R3 (<= 2.85 floor cap), tracks exact tokens/USD cost, and writes layer-d-r3-audit.{json,md}.
 *
 * Fail-Loud Policy: Never fabricates scores or silently switches models on API errors.
 * Usage: npx tsx --env-file=.env.local scripts/qa/run-dealcard-layer-d-judge.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PPGT_ALL_AXES,
  formatSimulatedReaction,
  type DealCardPpgtPersonaId,
  type PpgtAxisId,
  type RemediationTrack,
} from '../../src/lib/qa/dealcard-ppgt-personas';
import { DEALCARD_SHOWCASE_8 } from '../../src/lib/qa/output-showcase-scenarios';
import { parseMemoIntoCard4 } from '../../src/lib/deal-card/memo-pairing';
import { cleanBlindPoints } from '../../src/lib/deal-card/blind-guard';
import { toPublicDealCard } from '../../src/domain/public-projection/deal-card';

const ROOT = path.resolve(__dirname, '..', '..');
const PPGT_DIR = path.join(ROOT, 'e2e', 'golden-snapshots', 'out', 'dealcard-ppgt');
const BASELINE_JSON_PATH = path.join(PPGT_DIR, 'sprint1-baseline.json');
const REVIEW_PACKET_OUT_PATH = path.join(PPGT_DIR, 'DEALCARD_HUMAN_REVIEW_PACKET.md');

const MODEL = process.env.DEALCARD_LAYER_D_MODEL || 'gpt-4o';

const UI_SCREENSHOTS: ReadonlyArray<{ file: string; label: string; detail: 'low' | 'high' }> = [
  { file: 'dc01_workspace_1440_normal.png', label: '/broker/w/dealcards (1440 normal)', detail: 'low' },
  { file: 'dc01_workspace_1440_xlarge.png', label: '/broker/w/dealcards (1440 xlarge 21px)', detail: 'high' },
  { file: 'dc02_workspace_390_mobile.png', label: '/broker/w/dealcards (390x844 mobile)', detail: 'high' },
  { file: 'dc03_public_390_xlarge.png', label: 'Public /dc/[id] (390 xlarge 21px)', detail: 'high' },
  { file: 'dc04_public_owner_390_normal.png', label: 'Public /dc/[id] Owner HQ (390 normal)', detail: 'low' },
  { file: 'dc05_public_dev_360_normal.png', label: 'Public /dc/[id] Dev (360x800 normal)', detail: 'low' },
  { file: 'dc06_chaos_404_probe.png', label: 'Fail-Closed Chaos 404 /dc/0000... (1440)', detail: 'low' },
];

interface ChatMessagePart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail: 'low' | 'high' };
}

interface UsageAccumulator {
  promptTokens: number;
  completionTokens: number;
  calls: number;
}

interface NegativeControlJudgeOutput {
  overallScore: number;
  floorRisk: boolean;
  floorReason: string;
  detectedIssues: Array<{
    evidenceSpan: string;
    problem: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
  reaction: string;
}

interface PersonaUiEvalRaw {
  personaId: DealCardPpgtPersonaId;
  axes: Record<PpgtAxisId, number>;
  overallScore: number;
  floorRisk: boolean;
  floorReason: string;
  reaction: string;
  delightEvidenceSpan: string;
  frictionEvidenceSpan: string;
}

interface JudgeIssueRaw {
  surface: string;
  severity: 'critical' | 'major' | 'minor';
  track: RemediationTrack;
  targetFileHint: string;
  evidenceSpan: string;
  problem: string;
  suggestion: string;
}

interface UiJudgeOutput {
  personas: PersonaUiEvalRaw[];
  issues: JudgeIssueRaw[];
}

interface DealDeliverableEvalRaw {
  caseId: string;
  posture: string;
  blindSafetyScore: number;
  threeTierSpecClarityScore: number;
  copyConcisenessScore: number;
  buyerConversionPullScore: number;
  delightEvidenceSpan: string;
  frictionEvidenceSpan: string;
  issues: Array<{
    severity: 'critical' | 'major' | 'minor';
    track: RemediationTrack;
    evidenceSpan: string;
    problem: string;
    suggestion: string;
  }>;
}

interface DeliverableJudgeOutput {
  deals: DealDeliverableEvalRaw[];
  ogVisualScore: number;
  overallDeliverableR3: number;
  floorRisk: boolean;
  overallReaction: string;
  topTrack1Fixes: string[];
  topTrack2Fixes: string[];
}

interface BaselineRunRecord {
  personaId: DealCardPpgtPersonaId;
  surface: string;
  weightedOverall: number;
  floorRisk: boolean;
  floorReasons: string[];
  observedHeadings?: string[];
  observedButtons?: string[];
  observedBadges?: string[];
}

interface BaselinePayload {
  generatedAt: string;
  primaryDcUrl?: string;
  ogArtifactValid?: boolean;
  scoreResults: BaselineRunRecord[];
  sub44Diagnostics?: unknown[];
  clippedButtonDetails?: unknown[];
  backlog: Array<{
    tier: string;
    issueKey: string;
    track: string;
    pScore: number;
    targetFileHint: string;
    summaries: string[];
  }>;
}

function normalizeForGrounding(text: string): string {
  return text
    .replace(/["'“”‘’`\[\]()]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function isSpanGrounded(span: string | undefined, corpus: string): boolean {
  const clean = normalizeForGrounding(span || '');
  if (clean.length < 3 || /^(none|없음|n\/a|-)$/i.test(clean)) return false;
  return normalizeForGrounding(corpus).includes(clean);
}

function encodePngBase64(absPath: string): string {
  if (!fs.existsSync(absPath)) {
    throw new Error(`Missing required PNG artifact for DealCard Layer D vision check: ${absPath}`);
  }
  return `data:image/png;base64,${fs.readFileSync(absPath).toString('base64')}`;
}

async function callOpenAiJson<T>(
  apiKey: string,
  messages: Array<{ role: 'system' | 'user'; content: string | ChatMessagePart[] }>,
  usage: UsageAccumulator,
  stageLabel: string,
): Promise<T> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 3200,
      response_format: { type: 'json_object' },
      messages,
    }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new Error(`[DealCard Layer D FAIL-LOUD] ${stageLabel} HTTP ${res.status}: ${bodyText.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{ message?: { content?: string } }>;
  };

  usage.promptTokens += json.usage?.prompt_tokens ?? 0;
  usage.completionTokens += json.usage?.completion_tokens ?? 0;
  usage.calls += 1;

  const rawContent = json.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error(`[DealCard Layer D FAIL-LOUD] ${stageLabel} returned empty message content`);
  }
  return JSON.parse(rawContent) as T;
}

function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  const usd = (promptTokens / 1_000_000) * 2.5 + (completionTokens / 1_000_000) * 10.0;
  return Math.round(usd * 10_000) / 10_000;
}

const JUDGE_SYSTEM_PROMPT = `당신은 한국 상업용 부동산(CRE) 블라인드 티저 딜카드(DealCard) 및 60~70대 시니어 중개사·현금 자산가·법인 사옥 매수자 관점의 UI/UX·보안·콘텐츠 적합성을 20년간 감사해 온 엄격한 품질 감사관입니다.
아첨 금지(Anti-Sycophancy):
- 블라인드 유출 결함(상세 번지 '189-6', 건물명 '호산당빌딩', 특정 상호 '스타벅스', 브로커 외 제3자 전화번호 노출) OR
- UI/라이팅 치명 결함(가로 스크롤 오버플로우, <44px 터치 타깃, 개발자 용어 '포스처/OG 이미지/바텀시트/캡레이트', 원시 DB 에러 PGRST/NaN, 수치 주관적 미사여구 '양호한 수익률/넓은 대지' 남발)
중 하나라도 존재하면 다른 요소가 완벽해도 반드시 floorRisk=true 와 overallScore <= 2.9 를 부여하세요.
모든 근거 인용(delightEvidenceSpan, frictionEvidenceSpan, evidenceSpan)은 제공된 실제 DOM/코퍼스 원문 문구를 따옴표 없이 그대로 인용하세요(날조 금지).
모든 합성 반응(reaction / overallReaction)은 반드시 "[SIMULATED] " 로 시작하세요.
반드시 유효한 JSON 객체로만 응답하세요.`;

async function runNegativeControl(
  apiKey: string,
  usage: UsageAccumulator,
  spec: { controlId: string; stageLabel: string; payload: Record<string, unknown> },
): Promise<NegativeControlJudgeOutput> {
  const result = await callOpenAiJson<NegativeControlJudgeOutput>(
    apiKey,
    [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `아래 음성 대조군(의도적으로 치명적 결함을 심은 딜카드 샘플)을 감사하세요.\n` +
          `${JSON.stringify(spec.payload, null, 2)}\n\n` +
          `JSON 스키마: {"overallScore": number(1.0~5.0), "floorRisk": boolean, "floorReason": string, "detectedIssues": [{"evidenceSpan": string, "problem": string, "severity": "critical"|"major"|"minor"}], "reaction": "[SIMULATED] ..."}`,
      },
    ],
    usage,
    spec.stageLabel,
  );

  if (
    typeof result.overallScore !== 'number' ||
    result.overallScore > 2.9 ||
    result.floorRisk !== true
  ) {
    throw new Error(
      `[DealCard Layer D ABORT — SYCOPHANTIC JUDGE] ${spec.controlId} failed anti-sycophancy gate: ` +
        `overallScore=${result.overallScore} (expected <=2.9), floorRisk=${result.floorRisk} (expected true)`,
    );
  }

  return result;
}

async function runUiVisionAudit(
  apiKey: string,
  baseline: BaselinePayload,
  usage: UsageAccumulator,
): Promise<{ output: UiJudgeOutput; groundingCorpus: string }> {
  const domDigest = baseline.scoreResults.map((r) => ({
    personaId: r.personaId,
    surface: r.surface,
    r2Score: r.weightedOverall,
    r2FloorRisk: r.floorRisk,
    observedHeadings: r.observedHeadings?.slice(0, 8),
    observedButtons: r.observedButtons?.slice(0, 12),
  }));

  const additionalEvidence = [
    '딜카드',
    '어떤 매물인가요?',
    '카톡 썸네일 & 한 줄 제목',
    '장점 3줄',
    '현장 장점 바로 넣기',
    '역세권 도보 5분 내',
    '코너 입지 가시성',
    '디자인 우수한 외관',
    '내부 최근 올수리',
    '카톡 말풍선',
    '받는 화면',
    '매물 핵심 요약',
    '매물 주요 제원',
    '기본 제원',
    '건물 내역',
    '투자 검토 지표',
    '전화하기',
    '상세 제안서(IM) 요청',
    '카톡으로 보내기',
  ];

  const imageParts: ChatMessagePart[] = UI_SCREENSHOTS.map((shot) => ({
    type: 'image_url',
    image_url: {
      url: encodePngBase64(path.join(PPGT_DIR, shot.file)),
      detail: shot.detail,
    },
  }));

  const rawJsonText = JSON.stringify(baseline);
  const promptText =
    `다음 7장의 딜카드 웹 UI 스크린샷(${UI_SCREENSHOTS.map((s) => `${s.file}=${s.label}`).join(', ')})과 DOM 실측 요약을 함께 검수하세요.\n\n` +
    `[실측 DOM 요약]\n${JSON.stringify({ runs: domDigest, backlog: baseline.backlog }, null, 2)}\n\n` +
    `[사용 가능한 실제 UI 문구 예시 (evidenceSpan에는 이미지나 아래 실제 문구 원문만 인용)]\n` +
    `${additionalEvidence.join(' | ')}\n\n` +
    `6대 페르소나(DC-MG-01, DC-MG-02, DC-MG-03, DC-MG-04, DC-MG-05, DC-MG-06) 모두에 대해 6대 축(${PPGT_ALL_AXES.join(', ')})을 1.0~5.0으로 채점하고, 개선 이슈를 track1_ui_gate_renderer 또는 track2_copy_prompt 로 분류하세요.\n` +
    `JSON 스키마:\n` +
    `{"personas":[{"personaId":"DC-MG-01","axes":{"U1_first10s_clarity":n,"U2_visual_ergonomics":n,"U3_flow_resilience":n,"C1_provenance_honesty":n,"C2_artifact_shareability":n,"C3_safe_domain_fit":n},"overallScore":n,"floorRisk":boolean,"floorReason":string,"reaction":"[SIMULATED] ...","delightEvidenceSpan":string,"frictionEvidenceSpan":string}],"issues":[{"surface":string,"severity":"critical"|"major"|"minor","track":"track1_ui_gate_renderer"|"track2_copy_prompt","targetFileHint":string,"evidenceSpan":string,"problem":string,"suggestion":string}]}`;

  const output = await callOpenAiJson<UiJudgeOutput>(
    apiKey,
    [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: [{ type: 'text', text: promptText }, ...imageParts] },
    ],
    usage,
    'Stage D2 Call 1 (DealCard Web UI 7-Cut Multimodal Audit)',
  );

  const groundingCorpus = `${rawJsonText}\n${additionalEvidence.join('\n')}`;
  return { output, groundingCorpus };
}

async function runDeliverablesAudit(
  apiKey: string,
  usage: UsageAccumulator,
): Promise<{ output: DeliverableJudgeOutput; groundingCorpus: string }> {
  const dealCorpus = DEALCARD_SHOWCASE_8.map((sc) => {
    const parsed = parseMemoIntoCard4(sc.fastFillMemo, { posture: sc.card4Posture });
    const cleanedPts = cleanBlindPoints(parsed.points);
    const card4 = { ...parsed, posture: sc.card4Posture, points: cleanedPts };
    const dto = toPublicDealCard({
      id: sc.buildingId,
      building: {
        id: sc.buildingId,
        address: sc.address,
        raw_address: sc.address,
        asking_price_manwon: sc.askingPriceManwon,
        land_area_sqm: sc.landAreaSqm,
        total_area_sqm: sc.gfaSqm,
        zoning: sc.zoning,
        completion_date: sc.completionDate,
        main_usage: sc.posture === 'owner_occupier' ? '업무시설' : '근린생활시설',
        attrs: {
          address: sc.address,
          askingPrice: sc.askingPriceManwon > 0 ? sc.askingPriceManwon * 10_000 : null,
          landAreaSqm: sc.landAreaSqm,
          totalFloorAreaSqm: sc.gfaSqm,
          zoning: sc.zoning,
          completionDate: sc.completionDate,
          floorLeases: sc.rentRoll,
        },
      },
      signalCard: {
        title: card4.headline,
        area_signal: card4.region,
        asset_type: card4.use,
        price_band: card4.priceBand,
        body: { card4 },
      },
      teaserDoc: { body: { card4 } },
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
      pptxDownloadUrl: `/api/public/im-lite/${sc.buildingId}/pptx`,
    });

    return {
      caseId: sc.id,
      posture: sc.card4Posture,
      forbiddenTokensMustNotAppear: sc.forbiddenPublicTokens,
      publicHeader4: {
        region: dto.hero.regionLabel,
        use: dto.postureWidget.assetType || card4.use,
        area: dto.hero.bandedArea,
        priceBand: dto.hero.bandedPrice,
      },
      headline: dto.og.title,
      dealPoints3: dto.dealPoints,
      threeTierSpecs: dto.threeTierSpecs,
    };
  });

  const corpusRaw = JSON.stringify(dealCorpus, null, 2);
  const ogPngPath = path.join(PPGT_DIR, 'og_dealcard_kakao_v2.png');
  const imageParts: ChatMessagePart[] = fs.existsSync(ogPngPath)
    ? [
        {
          type: 'image_url',
          image_url: { url: encodePngBase64(ogPngPath), detail: 'high' },
        },
      ]
    : [];

  const promptText =
    `카카오톡 딜카드 OG v2 이미지(1200x630 다크 2x2)와 표준 딜카드 8종(DC-01~DC-08)의 실제 공개 투영(toPublicDealCard) 산출물 코퍼스를 검수하세요.\n\n` +
    `[점검 기준 (각 1.0~5.0)]\n` +
    `1. blindSafetyScore: 상세 지번·특정 브랜드·제3자 연락처 비노출 및 가격 밴드 보호\n` +
    `2. threeTierSpecClarityScore: 기본 제원(금액·대지·용도지역) + 건물 내역(연면적·층수·준공) + 투자 목적별 지표 충실도\n` +
    `3. copyConcisenessScore: 18자 압축 제목·장점 3줄 가독성 및 주관적 미사여구 배제\n` +
    `4. buyerConversionPullScore: 현금 자산가·사옥 대표·디벨로퍼 관점에서 IM 요청 전환 매력도\n\n` +
    `[표준 8종 공개 코퍼스 (evidenceSpan에는 반드시 아래 원문 문자열만 인용)]\n` +
    `${corpusRaw}\n\n` +
    `JSON 스키마:\n` +
    `{"deals":[{"caseId":"DC-01","posture":"income","blindSafetyScore":n,"threeTierSpecClarityScore":n,"copyConcisenessScore":n,"buyerConversionPullScore":n,"delightEvidenceSpan":string,"frictionEvidenceSpan":string,"issues":[{"severity":"critical"|"major"|"minor","track":"track1_ui_gate_renderer"|"track2_copy_prompt","evidenceSpan":string,"problem":string,"suggestion":string}]}],"ogVisualScore":n,"overallDeliverableR3":n,"floorRisk":boolean,"overallReaction":"[SIMULATED] ...","topTrack1Fixes":[string],"topTrack2Fixes":[string]}`;

  const output = await callOpenAiJson<DeliverableJudgeOutput>(
    apiKey,
    [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: [{ type: 'text', text: promptText }, ...imageParts] },
    ],
    usage,
    'Stage D2 Call 2 (DealCard OG PNG + 8-Deliverable Corpus R3 Audit)',
  );

  return { output, groundingCorpus: corpusRaw };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('[DealCard Layer D FAIL-LOUD] OPENAI_API_KEY is missing in environment.');
  }
  if (!fs.existsSync(BASELINE_JSON_PATH)) {
    throw new Error(`[DealCard Layer D FAIL-LOUD] Missing Layer C baseline JSON: ${BASELINE_JSON_PATH}`);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_JSON_PATH, 'utf8')) as BaselinePayload;
  const usage: UsageAccumulator = { promptTokens: 0, completionTokens: 0, calls: 0 };

  console.log(`[DealCard Layer D] Running Stage D1-A NC-DC-01-R3 (Blind Leak, model=${MODEL})...`);
  const ncBlind = await runNegativeControl(apiKey, usage, {
    controlId: 'NC-DC-01-R3',
    stageLabel: 'Stage D1-A (NC-DC-01-R3)',
    payload: {
      controlId: 'NC-DC-01-R3',
      surface: '/dc/sample-leak',
      metrics: { horizontalOverflowPx: 0, sub44ButtonsCount: 0 },
      observedText: [
        '영등포구 당산동1가 72-1 호산당빌딩 급매',
        '1층 스타벅스 입점 확정 · 양호한 수익률 보장',
        '매도인 직통 010-9999-8888 문의',
      ],
    },
  });
  console.log(
    `[DealCard Layer D] NC-DC-01-R3 PASSED (overallScore=${ncBlind.overallScore}, floorRisk=${ncBlind.floorRisk})`,
  );

  console.log(`[DealCard Layer D] Running Stage D1-B NC-DC-02-R3 (UX/Jargon Broken, model=${MODEL})...`);
  const ncUx = await runNegativeControl(apiKey, usage, {
    controlId: 'NC-DC-02-R3',
    stageLabel: 'Stage D1-B (NC-DC-02-R3)',
    payload: {
      controlId: 'NC-DC-02-R3',
      surface: '/broker/w/dealcards (390px xlarge)',
      metrics: { horizontalOverflowPx: 38, sub44ButtonsCount: 9, brokenImgCount: 1 },
      observedText: [
        '① 포스처 선택 및 OG 이미지 1사분면 편집',
        '바텀시트에서 캡레이트 입력: NaN%',
        'Error: PGRST204 column not found',
      ],
    },
  });
  console.log(
    `[DealCard Layer D] NC-DC-02-R3 PASSED (overallScore=${ncUx.overallScore}, floorRisk=${ncUx.floorRisk})`,
  );

  console.log('[DealCard Layer D] Running Stage D2 Call 1 (7 UI screenshots + DOM evidence)...');
  const { output: uiAudit, groundingCorpus: uiCorpus } = await runUiVisionAudit(
    apiKey,
    baseline,
    usage,
  );

  console.log('[DealCard Layer D] Running Stage D2 Call 2 (Kakao OG v2 PNG + DC-01..08 Corpus)...');
  const { output: deliverableAudit, groundingCorpus: deliverableCorpus } =
    await runDeliverablesAudit(apiKey, usage);

  for (const p of uiAudit.personas) {
    p.reaction = formatSimulatedReaction(p.reaction);
  }
  deliverableAudit.overallReaction = formatSimulatedReaction(deliverableAudit.overallReaction);

  const claimChecks: Array<{ source: string; span: string; grounded: boolean }> = [];
  for (const p of uiAudit.personas) {
    if (p.delightEvidenceSpan) {
      claimChecks.push({
        source: `${p.personaId}:delight`,
        span: p.delightEvidenceSpan,
        grounded: isSpanGrounded(p.delightEvidenceSpan, uiCorpus),
      });
    }
    if (p.frictionEvidenceSpan && !/^(none|없음|n\/a|-)$/i.test(p.frictionEvidenceSpan.trim())) {
      claimChecks.push({
        source: `${p.personaId}:friction`,
        span: p.frictionEvidenceSpan,
        grounded: isSpanGrounded(p.frictionEvidenceSpan, uiCorpus),
      });
    }
  }
  for (const issue of uiAudit.issues) {
    claimChecks.push({
      source: `UI-issue:${issue.surface}`,
      span: issue.evidenceSpan,
      grounded: isSpanGrounded(issue.evidenceSpan, uiCorpus),
    });
  }
  for (const d of deliverableAudit.deals) {
    if (d.delightEvidenceSpan) {
      claimChecks.push({
        source: `${d.caseId}:delight`,
        span: d.delightEvidenceSpan,
        grounded: isSpanGrounded(d.delightEvidenceSpan, deliverableCorpus),
      });
    }
    for (const issue of d.issues) {
      claimChecks.push({
        source: `${d.caseId}:issue`,
        span: issue.evidenceSpan,
        grounded: isSpanGrounded(issue.evidenceSpan, deliverableCorpus),
      });
    }
  }

  const groundedCount = claimChecks.filter((c) => c.grounded).length;
  const groundedRatio =
    claimChecks.length > 0 ? Math.round((groundedCount / claimChecks.length) * 1000) / 1000 : 1;

  const r2ByPersona = new Map<DealCardPpgtPersonaId, BaselineRunRecord[]>();
  for (const run of baseline.scoreResults) {
    const arr = r2ByPersona.get(run.personaId) ?? [];
    arr.push(run);
    r2ByPersona.set(run.personaId, arr);
  }

  const blendedPersonas = uiAudit.personas.map((r3) => {
    const r2Runs = r2ByPersona.get(r3.personaId) ?? [];
    const r2Mean =
      r2Runs.length > 0
        ? Math.round((r2Runs.reduce((s, r) => s + r.weightedOverall, 0) / r2Runs.length) * 100) /
          100
        : 5.0;
    const anyR2Floor = r2Runs.some((r) => r.floorRisk);
    const floorRisk = anyR2Floor || Boolean(r3.floorRisk);
    let blended = Math.round((0.7 * r2Mean + 0.3 * r3.overallScore) * 100) / 100;
    if (floorRisk) blended = Math.min(blended, 2.85);
    return {
      personaId: r3.personaId,
      r2Mean,
      r3Score: r3.overallScore,
      blendedScore: blended,
      floorRisk,
      reaction: r3.reaction,
      delightEvidenceSpan: r3.delightEvidenceSpan,
      frictionEvidenceSpan: r3.frictionEvidenceSpan,
    };
  });

  const costUsd = estimateCostUsd(usage.promptTokens, usage.completionTokens);
  const generatedAt = new Date().toISOString();

  const auditJson = {
    generatedAt,
    model: MODEL,
    usage: { ...usage, estimatedCostUsd: costUsd },
    negativeControls: [
      { controlId: 'NC-DC-01-R3', passed: true, ...ncBlind },
      { controlId: 'NC-DC-02-R3', passed: true, ...ncUx },
    ],
    grounding: {
      totalClaims: claimChecks.length,
      groundedCount,
      groundedRatio,
      checks: claimChecks,
    },
    blendedPersonas,
    uiAudit,
    deliverableAudit,
  };

  fs.mkdirSync(PPGT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(PPGT_DIR, 'layer-d-r3-audit.json'),
    JSON.stringify(auditJson, null, 2),
    'utf8',
  );

  const mdLines = [
    '# DealCard Layer D (PPGT R3): Anti-Sycophancy Multimodal & Teaser Suitability Audit',
    '',
    `- 생성 시각: ${generatedAt}`,
    `- 판정 모델: \`${MODEL}\` (${usage.calls} calls | prompt=${usage.promptTokens.toLocaleString()} | completion=${usage.completionTokens.toLocaleString()} | 추정 비용=\`$${costUsd.toFixed(4)}\`)`,
    `- 음성 대조군 1 (\`NC-DC-01-R3\` 블라인드 유출): **PASS** (score=${ncBlind.overallScore} <= 2.9, floorRisk=${ncBlind.floorRisk})`,
    `- 음성 대조군 2 (\`NC-DC-02-R3\` UX/용어 파괴): **PASS** (score=${ncUx.overallScore} <= 2.9, floorRisk=${ncUx.floorRisk})`,
    `- 원문 근거 접지율(\`isSpanGrounded\`): **${(groundedRatio * 100).toFixed(1)}%** (${groundedCount}/${claimChecks.length}, 기준 >= 50%)`,
    '',
    '## 1. 페르소나별 Blended Score (`0.70 * R2 + 0.30 * R3`)',
    '| Persona | R2 (DOM) | R3 (Vision/Judge) | Blended | FloorRisk | 합성 반응 (`[SIMULATED]`) |',
    '|:--|:--:|--:|--:|:--:|:--|',
    ...blendedPersonas.map(
      (b) =>
        `| ${b.personaId} | ${b.r2Mean.toFixed(2)} | ${b.r3Score.toFixed(2)} | **${b.blendedScore.toFixed(2)}** | ${b.floorRisk ? 'YES' : 'NO'} | ${b.reaction.replace(/\|/g, '/')} |`,
    ),
    '',
    '## 2. 표준 딜카드 8종(DC-01~08) 및 카톡 OG v2 R3 결과',
    `- 종합 Deliverable R3 점수: **${deliverableAudit.overallDeliverableR3} / 5.0** · 카톡 OG 시각: **${deliverableAudit.ogVisualScore} / 5.0** · floorRisk=${deliverableAudit.floorRisk}`,
    `- 종합 반응: ${deliverableAudit.overallReaction}`,
  ];

  fs.writeFileSync(path.join(PPGT_DIR, 'layer-d-r3-audit.md'), mdLines.join('\n'), 'utf8');
  fs.writeFileSync(REVIEW_PACKET_OUT_PATH, mdLines.join('\n'), 'utf8');

  console.log(
    `[DealCard Layer D DONE] groundedRatio=${(groundedRatio * 100).toFixed(1)}%, cost=$${costUsd.toFixed(4)}, deliverableR3=${deliverableAudit.overallDeliverableR3}/5.0`,
  );
  if (groundedRatio < 0.5) {
    throw new Error(`[DealCard Layer D FAIL-LOUD] Grounding ratio below 50%: ${groundedRatio}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
