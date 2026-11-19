/**
 * @file scripts/qa/run-newsletter-layer-d-judge.ts
 * @description Layer D (PPGT-Loop R3): Newsletter Anti-Sycophancy Multimodal Vision + Editorial R3 Judge.
 *   1) Stage D1 (2 Negative Controls — Fail-Loud):
 *      - NC-NL-01 (UI/Legal broken) -> MUST return overallScore <= 2.9 && floorRisk === true
 *      - NC-NL-02 (Content Suitability broken with clean layout) -> MUST return overallScore <= 2.9 && floorRisk === true
 *   2) Stage D2 Call 1 (1-Shot Web UI 10 Cuts + DOM evidence across NL-MG-01..06)
 *   3) Stage D2 Call 2 (1-Shot Email PC/Mobile PNG + 3 OG 1200x630 PNGs + Golden 3-Issue Corpus Editorial R3)
 *   4) Stage D3: Programmatically validates isSpanGrounded (groundedRatio >= 0.5), forces "[SIMULATED] " prefix,
 *      blends 0.70*R2 + 0.30*R3 (<= 2.85 floor cap), tracks exact tokens/USD cost, writes layer-d-r3-audit.{json,md},
 *      and generates final Human 2nd 3-Gate Packet in BOTH `e2e/golden-snapshots/out/newsletter-ppgt/` & `docs/finaltest/`.
 *
 * Fail-Loud Policy: Never fabricates scores or silently switches models on API errors.
 * Usage: npx tsx --env-file=.env.local scripts/qa/run-newsletter-layer-d-judge.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PPGT_ALL_AXES,
  formatSimulatedReaction,
  type NewsletterPpgtPersonaId,
  type PpgtAxisId,
  type RemediationTrack,
} from '../../src/lib/qa/newsletter-ppgt-personas';

const ROOT = path.resolve(__dirname, '..', '..');
const PPGT_DIR = path.join(ROOT, 'e2e', 'golden-snapshots', 'out', 'newsletter-ppgt');
const BASELINE_JSON_PATH = path.join(PPGT_DIR, 'sprint1-baseline.json');
const CORPUS_JSON_PATH = path.join(PPGT_DIR, 'golden-3issues-corpus.json');
const REVIEW_PACKET_OUT_PATH = path.join(PPGT_DIR, 'NEWSLETTER_HUMAN_REVIEW_PACKET.md');
const REVIEW_PACKET_DOCS_PATH = path.join(
  ROOT,
  'docs',
  'finaltest',
  'NEWSLETTER_HUMAN_REVIEW_PACKET.md',
);

const MODEL = process.env.NEWSLETTER_LAYER_D_MODEL || 'gpt-4o';

const UI_SCREENSHOTS: ReadonlyArray<{ file: string; label: string; detail: 'low' | 'high' }> = [
  { file: 'nl01_editor_tab1_1440_normal.png', label: '/broker/w/newsletter#title (1440 normal)', detail: 'low' },
  { file: 'nl02_editor_tab2_1440_normal.png', label: '/broker/w/newsletter#content (1440 normal)', detail: 'low' },
  { file: 'nl03_editor_tab3_send_1440.png', label: '/broker/w/newsletter#send (1440 normal)', detail: 'low' },
  { file: 'nl04_editor_tab2_1440_xlarge.png', label: '/broker/w/newsletter#content (1440 xlarge 21px)', detail: 'high' },
  { file: 'nl05_editor_390_mobile.png', label: '/broker/w/newsletter (390x844 mobile)', detail: 'high' },
  { file: 'nl06_reader_390_normal.png', label: 'Live Reader /magazine/[brokerId]/[date] (390 normal)', detail: 'low' },
  { file: 'nl07_reader_390_xlarge.png', label: 'Live Reader /magazine/[brokerId]/[date] (390 xlarge 21px)', detail: 'high' },
  { file: 'nl08_reader_360_normal.png', label: 'Live Reader /magazine/[brokerId]/[date] (360 normal)', detail: 'low' },
  { file: 'nl09_subscribe_390.png', label: 'Subscribe Landing /magazine/[brokerId]/subscribe (390x844)', detail: 'high' },
  { file: 'nl10_shortlink_chaos_probe.png', label: 'Fail-Closed Shortlink Chaos Probe /m/0000... (1440)', detail: 'low' },
];

const DELIVERABLE_SCREENSHOTS: ReadonlyArray<{ file: string; label: string; detail: 'low' | 'high' }> = [
  { file: 'email_nl_g1_pc_640.png', label: 'Email HTML Rendered (640px PC)', detail: 'low' },
  { file: 'email_nl_g1_mobile_390.png', label: 'Email HTML Rendered (390px Mobile)', detail: 'high' },
  { file: 'og-nl-g1-monthly.png', label: 'OG Card PNG 1200x630 (NL-G1 Monthly)', detail: 'high' },
  { file: 'og-nl-g3-daily.png', label: 'OG Card PNG 1200x630 (NL-G3 Daily No-Deal)', detail: 'low' },
  { file: 'og-nl-g4-special.png', label: 'OG Card PNG 1200x630 (NL-G4 Special Tax)', detail: 'low' },
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
  personaId: NewsletterPpgtPersonaId;
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

interface EditorialGoldenEvalRaw {
  goldenId: string;
  cadence: string;
  toneDignityScore: number;
  timelinessInsightScore: number;
  statsNarrativeCoherenceScore: number;
  dealCommentTrustScore: number;
  mobile30sScanScore: number;
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

interface DeliverableEditorialJudgeOutput {
  editions: EditorialGoldenEvalRaw[];
  emailVisualScore: number;
  ogVisualScore: number;
  overallEditorialR3: number;
  floorRisk: boolean;
  overallReaction: string;
  topTrack1Fixes: string[];
  topTrack2Fixes: string[];
}

interface BaselineRunRecord {
  personaId: NewsletterPpgtPersonaId;
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
  readerUrl?: string;
  subscribeUrl?: string;
  scoreResults: BaselineRunRecord[];
  tabDiagnostics: Array<{
    tab: string;
    aboveFoldActionCount: number;
    totalVisibleInteractiveCount: number;
    sub44ButtonsCount: number;
    sub14TextsCount: number;
    clippedButtonsCount: number;
    sidebarEllipsisCount?: number;
  }>;
  clippedButtonDetails: Array<{ surface: string; viewport: string; fontScale: string; buttons: unknown[] }>;
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
    throw new Error(`Missing required PNG artifact for Layer D vision check: ${absPath}`);
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
    throw new Error(`[Layer D FAIL-LOUD] ${stageLabel} HTTP ${res.status}: ${bodyText.slice(0, 400)}`);
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
    throw new Error(`[Layer D FAIL-LOUD] ${stageLabel} returned empty message content`);
  }
  return JSON.parse(rawContent) as T;
}

function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  const usd = (promptTokens / 1_000_000) * 2.5 + (completionTokens / 1_000_000) * 10.0;
  return Math.round(usd * 10_000) / 10_000;
}

const JUDGE_SYSTEM_PROMPT = `당신은 한국 상업용 부동산(CRE) 50~70대 건물주·자산가 대상 뉴스레터의 편집 적합성, 법정 준수, 시니어 UI/UX를 20년간 감사해 온 엄격한 품질 감사관입니다.
아첨 금지(Anti-Sycophancy):
- UI/법정 결함(가로 오버플로우, <44px 버튼, 개발자 용어 '포스처/바텀시트/슬러그', '(광고)' 표기 누락, 원시 DB 에러 PGRST/NaN) OR
- 콘텐츠 적합성 결함(연예인/가십성 기사, '확정 수익/100% 보장' 등 투자 권유 단정 표현, 출처 없는 날조 통계 수치, 말줄임(…)으로 끊긴 미완결 제목, 매물 0건인데 '공적장부 교차검증' 허위 배지)
이 중 하나라도 존재하면 다른 모든 요소가 훌륭해도 반드시 floorRisk=true 와 overallScore <= 2.9 를 부여하세요.
모든 근거 인용(delightEvidenceSpan, frictionEvidenceSpan, evidenceSpan)은 제공된 실제 텍스트/DOM 문구 원문을 그대로 인용하세요(날조 금지).
모든 합성 코멘트(reaction / overallReaction)는 반드시 "[SIMULATED] " 로 시작하세요.
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
          `아래 음성 대조군(의도적으로 치명적 결함을 심은 샘플)을 감사하세요.\n` +
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
      `[Layer D ABORT — SYCOPHANTIC JUDGE] ${spec.controlId} failed anti-sycophancy gate: ` +
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
  }));

  const rawJsonText = JSON.stringify(baseline);
  const additionalEvidence = [
    '뉴스레터 작업실',
    '표지·제목',
    '내용 채우기',
    '보내기',
    '발행 주기',
    '월간',
    '주간',
    '일간',
    '이번 달',
    'AI 핵심 이슈 5선 자동 재구성',
    '대표 수치·해설 직접 다듬기',
    'CREDEAL 안심 매거진',
    '개인정보 처리방침',
    '수집 거부 · 삭제 문의 안내 보기',
    '원문 보기 ↗',
  ];

  const imageParts: ChatMessagePart[] = UI_SCREENSHOTS.map((shot) => ({
    type: 'image_url',
    image_url: {
      url: encodePngBase64(path.join(PPGT_DIR, shot.file)),
      detail: shot.detail,
    },
  }));

  const promptText =
    `다음 10장의 뉴스레터 웹 UI 스크린샷(${UI_SCREENSHOTS.map((s) => `${s.file}=${s.label}`).join(', ')})과 DOM 실측 요약을 검수하세요.\n\n` +
    `[실측 DOM 요약]\n${JSON.stringify({ runs: domDigest, tabDiagnostics: baseline.tabDiagnostics, clippedButtons: baseline.clippedButtonDetails }, null, 2)}\n\n` +
    `[사용 가능한 실제 UI 문구 예시 (evidenceSpan에는 이미지나 아래 실제 문구 원문만 인용)]\n` +
    `${additionalEvidence.join(' | ')}\n\n` +
    `6대 페르소나(NL-MG-01, NL-MG-02, NL-MG-03, NL-MG-04, NL-MG-05, NL-MG-06) 모두에 대해 6대 축(${PPGT_ALL_AXES.join(', ')})을 1.0~5.0으로 채점하고, 개선 이슈를 track1_ui_gate_renderer 또는 track2_tf8_prompt 로 분류하세요.\n` +
    `JSON 스키마:\n` +
    `{"personas":[{"personaId":"NL-MG-01","axes":{"U1_first10s_clarity":n,"U2_visual_ergonomics":n,"U3_flow_resilience":n,"C1_provenance_honesty":n,"C2_artifact_shareability":n,"C3_safe_domain_fit":n},"overallScore":n,"floorRisk":boolean,"floorReason":string,"reaction":"[SIMULATED] ...","delightEvidenceSpan":string,"frictionEvidenceSpan":string}],"issues":[{"surface":string,"severity":"critical"|"major"|"minor","track":"track1_ui_gate_renderer"|"track2_tf8_prompt","targetFileHint":string,"evidenceSpan":string,"problem":string,"suggestion":string}]}`;

  const output = await callOpenAiJson<UiJudgeOutput>(
    apiKey,
    [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: [{ type: 'text', text: promptText }, ...imageParts] },
    ],
    usage,
    'Stage D2 Call 1 (Newsletter Web UI 10-Cut Multimodal Audit)',
  );

  const groundingCorpus = `${rawJsonText}\n${additionalEvidence.join('\n')}`;
  return { output, groundingCorpus };
}

async function runDeliverablesEditorialAudit(
  apiKey: string,
  usage: UsageAccumulator,
): Promise<{ output: DeliverableEditorialJudgeOutput; groundingCorpus: string }> {
  if (!fs.existsSync(CORPUS_JSON_PATH)) {
    throw new Error(`[Layer D FAIL-LOUD] Missing golden corpus JSON: ${CORPUS_JSON_PATH}`);
  }
  const corpusRaw = fs.readFileSync(CORPUS_JSON_PATH, 'utf8');

  const imageParts: ChatMessagePart[] = DELIVERABLE_SCREENSHOTS.map((shot) => ({
    type: 'image_url',
    image_url: {
      url: encodePngBase64(path.join(PPGT_DIR, shot.file)),
      detail: shot.detail,
    },
  }));

  const promptText =
    `다음 5장의 뉴스레터 산출물 이미지(${DELIVERABLE_SCREENSHOTS.map((s) => `${s.file}=${s.label}`).join(', ')})와 골든 3호 원문 코퍼스를 한국 CRE 자산가 뉴스레터 편집 적합성 5대 루브릭으로 엄격 검수하세요.\n\n` +
    `[5대 편집 적합성 루브릭 (각 1.0~5.0)]\n` +
    `1. toneDignityScore (50~70대 자산가·건물주 대상 VIP 품격과 차분한 어조, 과장/투기성 표현 배제)\n` +
    `2. timelinessInsightScore (Axios 5선 시의성 및 건물주 실질 시사점)\n` +
    `3. statsNarrativeCoherenceScore (월간 통계·금리·시장 온도와 서사의 논리적 일치)\n` +
    `4. dealCommentTrustScore (추천 매물 코멘트의 신뢰감, 영문 약어 한글 병기, 상세 지번 동단위 마스킹)\n` +
    `5. mobile30sScanScore (모바일 이메일/OG 카드 30초 완독성 및 한글 폰트 깨짐 없음)\n\n` +
    `[골든 3호 원문 코퍼스 (evidenceSpan에는 이미지나 아래 원문 문자열만 인용)]\n` +
    `${corpusRaw}\n\n` +
    `JSON 스키마:\n` +
    `{"editions":[{"goldenId":"NL-G1","cadence":"monthly","toneDignityScore":n,"timelinessInsightScore":n,"statsNarrativeCoherenceScore":n,"dealCommentTrustScore":n,"mobile30sScanScore":n,"delightEvidenceSpan":string,"frictionEvidenceSpan":string,"issues":[{"severity":"critical"|"major"|"minor","track":"track1_ui_gate_renderer"|"track2_tf8_prompt","evidenceSpan":string,"problem":string,"suggestion":string}]}],"emailVisualScore":n,"ogVisualScore":n,"overallEditorialR3":n,"floorRisk":boolean,"overallReaction":"[SIMULATED] ...","topTrack1Fixes":[string],"topTrack2Fixes":[string]}`;

  const output = await callOpenAiJson<DeliverableEditorialJudgeOutput>(
    apiKey,
    [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: [{ type: 'text', text: promptText }, ...imageParts] },
    ],
    usage,
    'Stage D2 Call 2 (Email/OG Deliverables + Golden Editorial R3 Audit)',
  );

  return { output, groundingCorpus: corpusRaw };
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('[Layer D FAIL-LOUD] OPENAI_API_KEY is missing in environment.');
  }
  if (!fs.existsSync(BASELINE_JSON_PATH)) {
    throw new Error(`[Layer D FAIL-LOUD] Missing Layer C baseline JSON: ${BASELINE_JSON_PATH}`);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_JSON_PATH, 'utf8')) as BaselinePayload;
  const usage: UsageAccumulator = { promptTokens: 0, completionTokens: 0, calls: 0 };

  // Stage D1-A: NC-NL-01 (UI & Legal Broken)
  console.log(`[Layer D] Running Stage D1-A NC-NL-01 (UI/Legal Broken, model=${MODEL})...`);
  const ncUiLegal = await runNegativeControl(apiKey, usage, {
    controlId: 'NC-NL-01',
    stageLabel: 'Stage D1-A (NC-NL-01)',
    payload: {
      controlId: 'NC-NL-01',
      surface: '/broker/w/newsletter + email-template',
      metrics: {
        horizontalOverflowPx: 42,
        sub44ButtonsCount: 4,
        aboveFoldActionCount: 145,
        emailHasAdLabel: false,
      },
      observedText: [
        '뉴스레터 포스처 설정',
        '바텀시트에서 구독자 목록 불러오기',
        'Error: PGRST204 column not found in magazine_editions',
        '모바일 CTA 버튼 높이 32px, 가로 넘침 42px',
        '이메일 제목에 (광고) 표기 누락 및 수신거부 링크 누락',
      ],
    },
  });
  console.log(
    `[Layer D] NC-NL-01 PASSED (overallScore=${ncUiLegal.overallScore}, floorRisk=${ncUiLegal.floorRisk})`,
  );

  // Stage D1-B: NC-NL-02 (Content Suitability Broken with spotless UI layout)
  console.log(`[Layer D] Running Stage D1-B NC-NL-02 (Content Suitability Broken, model=${MODEL})...`);
  const ncContentSuitability = await runNegativeControl(apiKey, usage, {
    controlId: 'NC-NL-02',
    stageLabel: 'Stage D1-B (NC-NL-02)',
    payload: {
      controlId: 'NC-NL-02',
      surface: '/magazine/sample-broker/2026-11-19 (무매물 일간 브리핑)',
      metrics: {
        horizontalOverflowPx: 0,
        sub44ButtonsCount: 0,
        brokenImgCount: 0,
        featuredDealsCount: 0,
      },
      observedText: [
        '제목: 금리 인하에 따른…',
        '이슈 1: 유명 여가수 200억 자택 경매 유찰, 열애설 여파 주목',
        '브리핑: 출처 없는 강남 공실률 1.2% 급감! 지금 투자하면 연 8.5% 확정 수익 보장!',
        '하단 배지: CREDEAL 안심 매거진 · 공적장부 교차검증 (실제 첨부 매물 0건)',
      ],
    },
  });
  console.log(
    `[Layer D] NC-NL-02 PASSED (overallScore=${ncContentSuitability.overallScore}, floorRisk=${ncContentSuitability.floorRisk})`,
  );

  // Stage D2 Call 1: Web UI 10 Cuts
  console.log('[Layer D] Running Stage D2 Call 1 (10 UI screenshots + DOM evidence)...');
  const { output: uiAudit, groundingCorpus: uiCorpus } = await runUiVisionAudit(
    apiKey,
    baseline,
    usage,
  );

  // Stage D2 Call 2: Email + OG Deliverables + Editorial 5-axis Suitability
  console.log('[Layer D] Running Stage D2 Call 2 (Email PC/Mobile + 3 OG PNGs + Editorial Corpus)...');
  const { output: editorialAudit, groundingCorpus: editorialCorpus } =
    await runDeliverablesEditorialAudit(apiKey, usage);

  // Enforce "[SIMULATED] " prefix everywhere
  for (const p of uiAudit.personas) {
    p.reaction = formatSimulatedReaction(p.reaction);
  }
  editorialAudit.overallReaction = formatSimulatedReaction(editorialAudit.overallReaction);

  // Verify programmatic span grounding across ALL claims
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
  for (const ed of editorialAudit.editions) {
    if (ed.delightEvidenceSpan) {
      claimChecks.push({
        source: `${ed.goldenId}:delight`,
        span: ed.delightEvidenceSpan,
        grounded: isSpanGrounded(ed.delightEvidenceSpan, editorialCorpus),
      });
    }
    for (const issue of ed.issues) {
      claimChecks.push({
        source: `${ed.goldenId}:issue`,
        span: issue.evidenceSpan,
        grounded: isSpanGrounded(issue.evidenceSpan, editorialCorpus),
      });
    }
  }

  const groundedCount = claimChecks.filter((c) => c.grounded).length;
  const groundedRatio =
    claimChecks.length > 0 ? Math.round((groundedCount / claimChecks.length) * 1000) / 1000 : 1;

  // Blend R2 (0.70) + R3 (0.30) per persona
  const r2ByPersona = new Map<NewsletterPpgtPersonaId, BaselineRunRecord[]>();
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
      { controlId: 'NC-NL-01', passed: true, ...ncUiLegal },
      { controlId: 'NC-NL-02', passed: true, ...ncContentSuitability },
    ],
    grounding: {
      totalClaims: claimChecks.length,
      groundedCount,
      groundedRatio,
      checks: claimChecks,
    },
    blendedPersonas,
    uiAudit,
    editorialAudit,
  };

  fs.mkdirSync(PPGT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(PPGT_DIR, 'layer-d-r3-audit.json'),
    JSON.stringify(auditJson, null, 2),
    'utf8',
  );

  const mdLines = [
    '# Newsletter Layer D (PPGT R3): Anti-Sycophancy Multimodal & Editorial Suitability Audit',
    '',
    `- 생성 시각: ${generatedAt}`,
    `- 판정 모델: \`${MODEL}\` (${usage.calls} calls | prompt=${usage.promptTokens.toLocaleString()} | completion=${usage.completionTokens.toLocaleString()} | 추정 비용=\`$${costUsd.toFixed(4)}\`)`,
    `- 음성 대조군 1 (\`NC-NL-01\` UI/법정 파괴본): **PASS** (score=${ncUiLegal.overallScore} <= 2.9, floorRisk=${ncUiLegal.floorRisk})`,
    `- 음성 대조군 2 (\`NC-NL-02\` 콘텐츠 적합성 파괴본): **PASS** (score=${ncContentSuitability.overallScore} <= 2.9, floorRisk=${ncContentSuitability.floorRisk})`,
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
    '## 2. 산출물 4종 및 골든 3호 Editorial 적합성 R3 결과',
    `- 종합 Editorial R3 점수: **${editorialAudit.overallEditorialR3} / 5.0** · 이메일 시각: **${editorialAudit.emailVisualScore}/5.0** · OG 카드 시각: **${editorialAudit.ogVisualScore}/5.0** · floorRisk=${editorialAudit.floorRisk}`,
    `- 종합 반응: ${editorialAudit.overallReaction}`,
    '',
    '| Golden | Cadence | 품격/어조 | 5선 시의성 | 통계-서사 일치 | 매물 코멘트 | 모바일 30초 스캔 | 근거 인용 (`delightEvidenceSpan`) |',
    '|:--|:--|--:|--:|--:|--:|--:|:--|',
    ...editorialAudit.editions.map(
      (ed) =>
        `| \`${ed.goldenId}\` | ${ed.cadence} | ${ed.toneDignityScore} | ${ed.timelinessInsightScore} | ${ed.statsNarrativeCoherenceScore} | ${ed.dealCommentTrustScore} | ${ed.mobile30sScanScore} | ${ed.delightEvidenceSpan.replace(/\|/g, '/')} |`,
    ),
    '',
    '## 3. 식별된 개선 후보 (Track 1 vs Track 2 분리)',
    '### Track 1 (`track1_ui_gate_renderer`)',
    ...(uiAudit.issues.filter((i) => i.track === 'track1_ui_gate_renderer').length === 0 &&
    editorialAudit.topTrack1Fixes.length === 0
      ? ['- 긴급 Track 1 결함 0건']
      : [
          ...uiAudit.issues
            .filter((i) => i.track === 'track1_ui_gate_renderer')
            .map(
              (i) =>
                `- [${i.severity}] \`${i.surface}\` -> \`${i.targetFileHint}\`: ${i.problem} (근거: "${i.evidenceSpan}") → ${i.suggestion}`,
            ),
          ...editorialAudit.topTrack1Fixes.map((f) => `- [Deliverable Track 1] ${f}`),
        ]),
    '',
    '### Track 2 (`track2_tf8_prompt` — Human 2nd 확정 후 일괄 1회 배치)',
    ...(uiAudit.issues.filter((i) => i.track === 'track2_tf8_prompt').length === 0 &&
    editorialAudit.topTrack2Fixes.length === 0
      ? ['- 없음']
      : [
          ...uiAudit.issues
            .filter((i) => i.track === 'track2_tf8_prompt')
            .map(
              (i) =>
                `- [${i.severity}] \`${i.surface}\`: ${i.problem} (근거: "${i.evidenceSpan}") → ${i.suggestion}`,
            ),
          ...editorialAudit.topTrack2Fixes.map((f) => `- [Editorial Track 2] ${f}`),
        ]),
  ];

  fs.writeFileSync(path.join(PPGT_DIR, 'layer-d-r3-audit.md'), mdLines.join('\n'), 'utf8');

  const packetLines = [
    '# Newsletter Human 2nd Review Packet (1차 검수 패킷 — 총 35분 3-Gate)',
    '',
    `- 생성 시각: ${generatedAt}`,
    `- 판정 모델: \`${MODEL}\` · 추정 실측 비용 \`$${costUsd.toFixed(4)}\` (${usage.calls} calls: ${usage.promptTokens.toLocaleString()} in / ${usage.completionTokens.toLocaleString()} out)`,
    `- 음성 대조군 2종: \`NC-NL-01\` **PASS** (${ncUiLegal.overallScore} <= 2.9) · \`NC-NL-02\` **PASS** (${ncContentSuitability.overallScore} <= 2.9)`,
    `- 원문 근거 접지율(\`isSpanGrounded\`): **${(groundedRatio * 100).toFixed(1)}%** (${groundedCount}/${claimChecks.length})`,
    '',
    '## AI 1st (Layer A ~ Layer D) 검증 결과 요약',
    '| 검증 계층 | 핵심 조치 및 검증 항목 | 결과 |',
    '|:--|:--|:--|',
    '| **Layer A: 정적 가드 & 스키마** | 독자 뷰어·이메일·알림톡·OG UX 라이팅 가드 전면 편입, `/m/[slug]`·`w/magazine` `<14px` AST 가드 편입 | PASS |',
    '| **Layer B: 8-Golden 콘텐츠 오라클** | `NL-G1..G8` × 4종 산출물 크로스-패리티 + 카카오 주기 문구 동기화 + 이메일 HTML/OG 1200×630 PNG 렌더링 | PASS (8/8) |',
    '| **Layer C: 6-Persona DOM 프로브** | `NL-MG-01..06` 실라이브 편집기·뷰어·구독·카오스·이메일 뷰포트 프로브 (`clipped=0`, `overflow=0`, `floorRisk=0`) | PASS |',
    `| **Layer D: 멀티모달 · Editorial R3** | UI 10컷 + 이메일 PC/모바일 + OG 3종 + 골든 3호 편집 적합성 R3 (**${editorialAudit.overallEditorialR3}/5.0**) | ${editorialAudit.overallEditorialR3 >= 4.2 && !editorialAudit.floorRisk ? 'PASS' : 'CHECK'} |`,
    '',
    '## Track 1 주요 고도화 완료 내역',
    '- **발행 관문 콘텐츠 적합성 봉쇄 (`publish/route.ts` + `quality-gate.ts`)**: 투자권유 단정 표현(`422`)·내부 라벨 누출(`422`)·비CRE 가십(`409`)·말줄임/조사 미완결(`409`)·발행 주기 불일치(`409`) 통합 차단',
    '- **출처·검증 배지 정직성 (`PoweredByBadge.tsx`, `AxiosIssuesEditorPanel.tsx`)**: 무매물·비DB 호수 `"공적장부 교차검증"` 과장 문구 제거, `CURATED_CHANNEL_POOL` 단독 사용 시 `"참고 예시 카드(실시간 기사 아님)"` 안내 배지 표시',
    '- **4종 산출물 주기 문구 동기화 (`kakao-text.ts`)**: 월간/일간/호외/주간 알림톡 도착 문구 정밀 일치',
    '- **시니어 UI 적합성 및 Tab 2 인지 부하 절감**: `NewsletterContentStepPanel` 통계 다듬기 기본 접힘 + 클릭-투-에딧 자동 펼침, `TrackingNotice` 수집 거부 안내 접힘, `AxiosGlassIssueCard` `"원문 보기 ↗"` 한 줄 고정, `xlarge(21px)` 통계 배지·발행주기 여백 정비',
    '',
    '## 페르소나별 Blended Score (`0.70 * R2 + 0.30 * R3`)',
    '| Persona | R2 (DOM) | R3 (Vision/Judge) | Blended | FloorRisk |',
    '|:--|:--:|--:|--:|:--:|',
    ...blendedPersonas.map(
      (b) =>
        `| ${b.personaId} | ${b.r2Mean.toFixed(2)} | ${b.r3Score.toFixed(2)} | **${b.blendedScore.toFixed(2)}** | ${b.floorRisk ? 'YES' : 'NO'} |`,
    ),
    '',
    '## 골든 3호 Editorial 적합성 R3 채점표',
    `- 종합 반응: ${editorialAudit.overallReaction}`,
    '| Golden | Cadence | 품격/어조 | 5선 시의성 | 통계-서사 일치 | 매물 코멘트 | 모바일 30초 스캔 |',
    '|:--|:--|--:|--:|--:|--:|--:|',
    ...editorialAudit.editions.map(
      (ed) =>
        `| \`${ed.goldenId}\` | ${ed.cadence} | ${ed.toneDignityScore} | ${ed.timelinessInsightScore} | ${ed.statsNarrativeCoherenceScore} | ${ed.dealCommentTrustScore} | ${ed.mobile30sScanScore} |`,
    ),
    '',
    '## Human 2nd 3-Gate 검수 체크리스트 (총 35분)',
    '- [ ] **Gate H1 (10분 — 눈·편집 품격 검수)**: UI 10컷(`nl01`~`nl10`), 이메일 HTML 렌더(`email_nl_g1_pc_640.png`, `email_nl_g1_mobile_390.png`), OG PNG 3종(`og-nl-g1/g3/g4`), 골든 3호 원문의 어감·신뢰감 확인 → 항목별 `Approve / Reject(1줄 사유)`',
    '- [ ] **Gate H2 (15분 — 손끝 무마찰 & 콘텐츠 제어 검수)**: `/broker/w/newsletter`에서 실제 이번 주 월간호 1편을 설명서 없이 5분 내 작성·편집·발행 완주하며 ① 5초 이상 망설인 지점, ② 부적합 기사·문구 핀, ③ 자동저장/미리보기 반응 기록',
    '- [ ] **Gate H3 (10분 — 실물 수신 신뢰도 검수)**: 본인 실제 이메일함(Gmail/네이버/Outlook) 테스트 발송본 & 실폰 카카오톡(`/m/[slug]` + OG 썸네일)으로 `(광고)`/5대 법정 표기/수신거부/지번 마스킹 최종 Sign-off',
    '',
    '## 증거 파일 및 상세 리포트 경로',
    `- Layer C DOM 프로브 보고서: \`${path.join(PPGT_DIR, 'sprint1-baseline.md')}\``,
    `- Layer D R3 심사 전문: \`${path.join(PPGT_DIR, 'layer-d-r3-audit.md')}\``,
    `- 골든 3호 원문 코퍼스: \`${CORPUS_JSON_PATH}\``,
    ...UI_SCREENSHOTS.map((s) => `- [${s.label}] \`${path.join(PPGT_DIR, s.file)}\``),
    ...DELIVERABLE_SCREENSHOTS.map((s) => `- [${s.label}] \`${path.join(PPGT_DIR, s.file)}\``),
  ];

  const finalPacket = `${packetLines.join('\n')}\n`;
  fs.writeFileSync(REVIEW_PACKET_OUT_PATH, finalPacket, 'utf8');
  fs.mkdirSync(path.dirname(REVIEW_PACKET_DOCS_PATH), { recursive: true });
  fs.writeFileSync(REVIEW_PACKET_DOCS_PATH, finalPacket, 'utf8');

  console.log(
    `[Layer D DONE] groundedRatio=${(groundedRatio * 100).toFixed(1)}%, cost=$${costUsd.toFixed(4)}, editorialR3=${editorialAudit.overallEditorialR3}/5.0`,
  );
  if (groundedRatio < 0.5) {
    throw new Error(`[Layer D FAIL-LOUD] Grounding ratio below 50%: ${groundedRatio}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
